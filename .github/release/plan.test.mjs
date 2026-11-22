import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const here = import.meta.dirname;
const repoRoot = join(here, "..", "..");
const planCommand = join(here, "plan.mjs");

function throwawayRepo() {
  const dir = mkdtempSync(join(tmpdir(), "release-plan-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  copyFileSync(join(repoRoot, "cog.toml"), join(dir, "cog.toml"));

  const touch = (...paths) => {
    for (const path of paths) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      appendFileSync(join(dir, path), "change\n");
    }
  };
  const commit = (message, ...paths) => {
    touch(...paths);
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", message);
  };

  commit("chore: seed", "apps/desktop/package.json", "packages/client/package.json");
  git("tag", "-a", "desktop-v0.1.0", "-m", "desktop-v0.1.0");
  git("tag", "-a", "client-v0.1.0", "-m", "client-v0.1.0");

  const plan = async (...commit) =>
    JSON.parse((await promisify(execFile)("node", [planCommand, ...commit], { cwd: dir })).stdout);

  const nextVersions = async () => {
    const { desktop, client } = await plan();
    return { desktop: desktop?.version ?? null, client: client?.version ?? null };
  };

  return { git, commit, plan, nextVersions };
}

describe("release plan", { concurrency: true }, () => {
  test("a feat under packages/client/ bumps only the Client's minor version", async () => {
    const repo = throwawayRepo();
    repo.commit("feat: a Client feature", "packages/client/src/index.ts");

    assert.deepEqual(await repo.nextVersions(), { desktop: null, client: "0.2.0" });
  });

  const desktopPaths = [
    "apps/desktop/src/main.ts",
    "crates/core/src/lib.rs",
    "templates/presentation/src/App.tsx",
    "scripts/build-sidecar.sh",
    "Cargo.toml",
    "Cargo.lock",
  ];

  for (const path of desktopPaths) {
    test(`a fix to ${path} bumps only the Desktop App's patch version`, async () => {
      const repo = throwawayRepo();
      repo.commit("fix: a Desktop App fix", path);

      assert.deepEqual(await repo.nextVersions(), { desktop: "0.1.1", client: null });
    });
  }

  test("one commit touching both components bumps both", async () => {
    const repo = throwawayRepo();
    repo.commit("feat: a feature across both", "packages/client/src/index.ts", "crates/core/src/lib.rs");

    assert.deepEqual(await repo.nextVersions(), { desktop: "0.2.0", client: "0.2.0" });
  });

  const neitherPaths = [
    "docs/release.md",
    "GLOSSARY.md",
    "README.md",
    "protocol-fixtures/session.json",
    ".github/workflows/ci.yml",
    "package.json",
    "package-lock.json",
  ];

  for (const path of neitherPaths) {
    test(`a feat to ${path} bumps neither component`, async () => {
      const repo = throwawayRepo();
      repo.commit("feat: housekeeping", path);

      assert.deepEqual(await repo.nextVersions(), { desktop: null, client: null });
    });
  }

  const bumps = [
    { message: "feat: a feature", client: "0.2.0" },
    { message: "fix: a fix", client: "0.1.1" },
    { message: "perf: faster", client: "0.1.1" },
    { message: "chore: tidy up", client: null },
    { message: "docs: explain", client: null },
    { message: "refactor: reshape", client: null },
    { message: "test: cover", client: null },
  ];

  for (const { message, client } of bumps) {
    test(`"${message}" moves the Client to ${client ?? "no new version"}`, async () => {
      const repo = throwawayRepo();
      repo.commit(message, "packages/client/src/index.ts");

      assert.deepEqual(await repo.nextVersions(), { desktop: null, client });
    });
  }

  const breakingChanges = [
    "feat!: a breaking feature",
    "fix(api)!: a breaking fix",
    "fix: a fix\n\nBREAKING CHANGE: the old call is gone",
  ];

  for (const message of breakingChanges) {
    test(`a breaking change in 0.x (${message.split("\n")[0]}) moves the Client to 1.0.0`, async () => {
      const repo = throwawayRepo();
      repo.commit(message, "packages/client/src/index.ts");

      assert.deepEqual(await repo.nextVersions(), { desktop: null, client: "1.0.0" });
    });
  }

  test("a breaking change after 1.0.0 bumps the major version", async () => {
    const repo = throwawayRepo();
    repo.git("tag", "-a", "client-v1.2.3", "-m", "client-v1.2.3");
    repo.commit("feat!: a breaking feature", "packages/client/src/index.ts");

    assert.deepEqual(await repo.nextVersions(), { desktop: null, client: "2.0.0" });
  });

  test("a breaking change to one component leaves the other's version alone", async () => {
    const repo = throwawayRepo();
    repo.commit("feat!: a breaking Desktop App feature", "apps/desktop/src/main.ts");
    repo.commit("fix: a Client fix", "packages/client/src/index.ts");

    assert.deepEqual(await repo.nextVersions(), { desktop: "1.0.0", client: "0.1.1" });
  });

  const withoutHashes = (notes) => notes.replace(/\([0-9a-f]{7}\)/g, "(sha)");

  test("each component's notes list only its own conventional commits since its last tag", async () => {
    const repo = throwawayRepo();
    repo.commit("feat: a Client feature", "packages/client/src/index.ts");
    repo.commit("fix(api)!: a breaking Client fix", "packages/client/src/client.ts");
    repo.commit("perf: a faster Desktop App", "crates/core/src/lib.rs");
    repo.commit("feat: a documented feature", "docs/release.md");

    const { client, desktop } = await repo.plan();

    assert.equal(
      withoutHashes(client.notes),
      [
        "### Bug Fixes",
        "- **BREAKING** **api:** a breaking Client fix (sha)",
        "",
        "### Features",
        "- a Client feature (sha)",
      ].join("\n"),
    );
    assert.equal(withoutHashes(desktop.notes), "### Performance Improvements\n- a faster Desktop App (sha)");
  });

  test("notes start after the component's previous tag", async () => {
    const repo = throwawayRepo();
    repo.commit("feat: a released Client feature", "packages/client/src/index.ts");
    repo.git("tag", "-a", "client-v0.2.0", "-m", "client-v0.2.0");
    repo.commit("fix: a new Client fix", "packages/client/src/index.ts");

    const { client } = await repo.plan();

    assert.equal(client.version, "0.2.1");
    assert.equal(withoutHashes(client.notes), "### Bug Fixes\n- a new Client fix (sha)");
  });

  test("a merge commit's own message bumps nothing", async () => {
    const repo = throwawayRepo();
    repo.git("switch", "-q", "-c", "topic");
    repo.commit("chore: tidy the Client", "packages/client/src/index.ts");
    repo.git("switch", "-q", "main");
    repo.git("merge", "-q", "--no-ff", "-m", "feat: merge the topic", "topic");

    assert.deepEqual(await repo.nextVersions(), { desktop: null, client: null });
  });

  test("a non-conventional merge commit does not stop the merged commits bumping", async () => {
    const repo = throwawayRepo();
    repo.git("switch", "-q", "-c", "spec");
    repo.commit("fix: a Client fix", "packages/client/src/index.ts");
    repo.git("switch", "-q", "main");
    repo.git("merge", "-q", "--no-ff", "-m", "Merge spec time-to-present-1: a spec", "spec");

    assert.deepEqual(await repo.nextVersions(), { desktop: null, client: "0.1.1" });
  });

  test("the plan is for the given commit, not later ones", async () => {
    const repo = throwawayRepo();
    repo.commit("fix: a Client fix", "packages/client/src/index.ts");
    repo.commit("feat: a later Desktop App feature", "apps/desktop/src/main.ts");

    const { desktop, client } = await repo.plan("HEAD~1");

    assert.deepEqual({ desktop, client: client.version }, { desktop: null, client: "0.1.1" });
  });

  test("planning leaves the repo's tags, commits and files as they were", async () => {
    const repo = throwawayRepo();
    repo.commit("feat: a Client feature", "packages/client/src/index.ts");
    const before = repo.git("show-ref") + repo.git("status", "--porcelain", "--ignored");

    await repo.plan();

    assert.equal(repo.git("show-ref") + repo.git("status", "--porcelain", "--ignored"), before);
  });
});
