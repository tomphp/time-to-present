import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGES = ["desktop", "client"];
const NOTHING_TO_BUMP = "No conventional commit found to bump current version";
const NO_COMMITS = "No commit found to create a changelog";
const BREAKING_MARKER = "<!-- breaking change -->";
const NOTES_TEMPLATE = join(import.meta.dirname, "notes.tera");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

export function planRelease(repo, commit = "HEAD") {
  const sha = git(repo, "rev-parse", "--verify", `${commit}^{commit}`);
  const releasedAfter = laterReleaseTag(repo, sha);
  if (releasedAfter) return { desktop: null, client: null, releasedAfter };
  const work = mkdtempSync(join(tmpdir(), "release-plan-"));
  try {
    const clone = join(work, "repo");
    git(repo, "clone", "--quiet", "--shared", "--no-checkout", repo, clone);
    git(clone, "checkout", "--quiet", "--detach", sha);
    const cog = cogIn(clone, join(work, "cog.toml"));
    return Object.fromEntries(PACKAGES.map((name) => [name, planPackage(cog, name)]));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function laterReleaseTag(repo, sha) {
  const releaseTags = (...filter) =>
    git(repo, "tag", "--list", ...PACKAGES.map((name) => `${name}-v*`), ...filter).split("\n").filter(Boolean);
  const onSha = releaseTags("--points-at", sha);
  return releaseTags("--contains", sha).find((tag) => !onSha.includes(tag));
}

function planPackage(cog, name) {
  const changes = cog.changesSinceLastTag(name);
  if (!changes) return null;
  if (changes.breaking) return { version: nextMajor(cog.currentVersion(name)), notes: changes.notes };
  const version = cog.nextVersion(name);
  return version && { version, notes: changes.notes };
}

function nextMajor(version) {
  return `${Number(version.split(".")[0]) + 1}.0.0`;
}

function cogIn(clone, notesConfig) {
  writeFileSync(notesConfig, withPackageNotes(readFileSync(join(clone, "cog.toml"), "utf8")));
  const cog = (...args) => spawnSync("cog", ["--config", notesConfig, ...args], { cwd: clone, encoding: "utf8" });
  const fail = (args, run) => new Error(`cog ${args.join(" ")} failed:\n${run.stderr}`);

  return {
    currentVersion(name) {
      const args = ["get-version", "--package", name];
      const run = cog(...args);
      if (run.status !== 0) throw fail(args, run);
      return run.stdout.trim();
    },

    nextVersion(name) {
      const args = ["bump", "--auto", "--dry-run", "--package", name];
      const run = cog(...args);
      const tag = run.stdout.trim();
      if (run.status === 0 && tag.startsWith(`${name}-v`)) return tag.slice(`${name}-v`.length);
      if (run.status === 0 || run.stderr.includes(NOTHING_TO_BUMP)) return null;
      throw fail(args, run);
    },

    changesSinceLastTag(name) {
      const tagsBefore = packageTags(clone, name);
      const args = ["bump", "--patch", "--package", name];
      const run = cog(...args);
      if (run.status !== 0 && run.stderr.includes(NO_COMMITS)) return null;
      if (run.status !== 0) throw fail(args, run);
      const notes = notesIn(writtenChangelog(clone));
      git(clone, "reset", "--quiet", "--hard");
      git(clone, "tag", "--delete", ...packageTags(clone, name).filter((tag) => !tagsBefore.includes(tag)));
      return { notes: notes.replace(BREAKING_MARKER, "").trim(), breaking: notes.includes(BREAKING_MARKER) };
    },
  };
}

function withPackageNotes(cogToml) {
  const changelogs = cogToml.replace(/^disable_changelog = true$/m, "disable_changelog = false");
  return `${changelogs}\n[changelog]\npackage_template = ${JSON.stringify(NOTES_TEMPLATE)}\n`;
}

function writtenChangelog(clone) {
  const written = git(clone, "diff", "--cached", "--name-only").split("\n").filter(Boolean);
  if (written.length !== 1) throw new Error(`expected cog to write one changelog, got: ${written.join(", ")}`);
  return readFileSync(join(clone, written[0]), "utf8");
}

function packageTags(clone, name) {
  return git(clone, "tag", "--list", `${name}-v*`).split("\n").filter(Boolean);
}

function notesIn(changelog) {
  const sections = changelog.split(/^- - -$/m);
  if (sections.length !== 3) throw new Error(`unexpected changelog layout:\n${changelog}`);
  return sections[1];
}

if (import.meta.main) {
  console.log(JSON.stringify(planRelease(process.cwd(), process.argv[2]), null, 2));
}
