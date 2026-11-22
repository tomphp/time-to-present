import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGES = ["desktop", "client"];
const NO_BUMP = "No conventional commit found to bump current version";
const BREAKING_MARKER = "<!-- breaking change -->";
const NOTES_TEMPLATE = join(import.meta.dirname, "notes.tera");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

export function planRelease(repo, commit = "HEAD") {
  const sha = git(repo, "rev-parse", "--verify", `${commit}^{commit}`);
  const work = mkdtempSync(join(tmpdir(), "release-plan-"));
  try {
    const clone = join(work, "repo");
    git(repo, "clone", "--quiet", "--shared", "--no-checkout", repo, clone);
    git(clone, "checkout", "--quiet", "--detach", sha);
    const config = join(work, "cog.toml");
    writeFileSync(config, withPackageNotes(readFileSync(join(clone, "cog.toml"), "utf8")));
    return Object.fromEntries(PACKAGES.map((name) => [name, planPackage(clone, config, name)]));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function planPackage(clone, config, name) {
  const tagsBefore = packageTags(clone, name);
  const bump = spawnSync("cog", ["--config", config, "bump", "--auto", "--package", name], {
    cwd: clone,
    encoding: "utf8",
  });
  if (bump.status !== 0 && !bump.stderr.includes(NO_BUMP)) {
    throw new Error(`cog bump --package ${name} failed:\n${bump.stderr}`);
  }
  const tag = packageTags(clone, name).find((tag) => !tagsBefore.includes(tag));
  const changelog = tag && readFileSync(join(clone, git(clone, "diff", "--cached", "--name-only")), "utf8");
  git(clone, "reset", "--quiet", "--hard");
  if (!tag) return null;

  const notes = changelog.split(/^- - -$/m)[1];
  const version = tag.slice(`${name}-v`.length);
  const breaksZeroDotX = notes.includes(BREAKING_MARKER) && version.startsWith("0.");
  return {
    version: breaksZeroDotX ? "1.0.0" : version,
    notes: notes.replace(BREAKING_MARKER, "").trim(),
  };
}

function withPackageNotes(cogToml) {
  const changelogs = cogToml.replace(/^disable_changelog = true$/m, "disable_changelog = false");
  return `${changelogs}\n[changelog]\npackage_template = ${JSON.stringify(NOTES_TEMPLATE)}\n`;
}

function packageTags(clone, name) {
  return git(clone, "tag", "--list", `${name}-v*`).split("\n").filter(Boolean);
}

if (import.meta.main) {
  console.log(JSON.stringify(planRelease(process.cwd(), process.argv[2]), null, 2));
}
