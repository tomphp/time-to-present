import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const stampScript = join(repo, "scripts", "stamp.mjs");
const clientManifest = "packages/client/package.json";

function copyOfVersionedFiles() {
  const root = mkdtempSync(join(tmpdir(), "stamp-"));
  mkdirSync(join(root, "packages", "client"), { recursive: true });
  cpSync(join(repo, clientManifest), join(root, clientManifest));
  return root;
}

const stamp = (root, ...args) => spawnSync("node", [stampScript, ...args, "--root", root], { encoding: "utf8" });
const readJson = (root, path) => JSON.parse(readFileSync(join(root, path), "utf8"));

test("stamp client writes the version and points exports at dist", () => {
  const root = copyOfVersionedFiles();
  const before = readJson(root, clientManifest);

  const result = stamp(root, "client", "1.4.2");

  assert.equal(result.status, 0, result.stderr);
  const after = readJson(root, clientManifest);
  assert.equal(after.version, "1.4.2");
  assert.deepEqual(after.exports, { types: "./dist/index.d.ts", default: "./dist/index.js" });
  assert.deepEqual({ ...after, version: before.version, exports: before.exports }, before);
});

test("stamp client keeps the key order and layout of the manifest", () => {
  const root = copyOfVersionedFiles();
  const before = readFileSync(join(root, clientManifest), "utf8");

  stamp(root, "client", "1.4.2");

  const after = readFileSync(join(root, clientManifest), "utf8");
  assert.deepEqual(Object.keys(JSON.parse(after)), Object.keys(JSON.parse(before)));
  assert.equal(after, JSON.stringify(JSON.parse(after), null, 2) + "\n");
});

test("stamp client is idempotent", () => {
  const root = copyOfVersionedFiles();
  stamp(root, "client", "1.4.2");
  const once = readFileSync(join(root, clientManifest), "utf8");

  stamp(root, "client", "1.4.2");

  assert.equal(readFileSync(join(root, clientManifest), "utf8"), once);
});

test("stamp rejects a missing or malformed version without touching the files", () => {
  const root = copyOfVersionedFiles();
  const before = readFileSync(join(root, clientManifest), "utf8");

  for (const args of [["client"], ["client", "v1.0"], ["client", "latest"]]) {
    assert.notEqual(stamp(root, ...args).status, 0, args.join(" "));
  }
  assert.equal(readFileSync(join(root, clientManifest), "utf8"), before);
});

test("stamp takes --root before the command", () => {
  const root = copyOfVersionedFiles();

  const result = spawnSync("node", [stampScript, "--root", root, "client", "2.0.0"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readJson(root, clientManifest).version, "2.0.0");
});

test("stamp rejects a --root with no directory", () => {
  const result = spawnSync("node", [stampScript, "client", "2.0.0", "--root"], { encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage/i);
});

test("stamp rejects an unknown command", () => {
  const result = stamp(copyOfVersionedFiles(), "nonsense", "1.0.0");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage/i);
});
