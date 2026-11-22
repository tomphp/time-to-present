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

const desktopFiles = [
  "Cargo.toml",
  "Cargo.lock",
  "apps/desktop/src-tauri/tauri.conf.json",
  "apps/desktop/src-tauri/Cargo.toml",
  "crates/core/Cargo.toml",
  "crates/server/Cargo.toml",
  "crates/stt-sidecar/Cargo.toml",
  "templates/presentation/package.json",
];

function copyOfDesktopFiles() {
  const root = mkdtempSync(join(tmpdir(), "stamp-"));
  for (const file of desktopFiles) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(repo, file), join(root, file));
  }
  return root;
}

const read = (root, path) => readFileSync(join(root, path), "utf8");
const changedLines = (before, after) => {
  const old = before.split("\n");
  return after.split("\n").flatMap((line, i) => (line === old[i] ? [] : [[old[i], line]]));
};

test("stamp desktop writes the version into the Tauri config and nothing else there", () => {
  const root = copyOfDesktopFiles();
  const path = "apps/desktop/src-tauri/tauri.conf.json";
  const before = read(root, path);

  const result = stamp(root, "desktop", "3.1.0", "2.5.0");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(changedLines(before, read(root, path)), [['  "version": "0.1.0",', '  "version": "3.1.0",']]);
});

test("stamp desktop writes the Cargo workspace version and nothing else there", () => {
  const root = copyOfDesktopFiles();
  const before = read(root, "Cargo.toml");

  stamp(root, "desktop", "3.1.0", "2.5.0");

  assert.deepEqual(changedLines(before, read(root, "Cargo.toml")), [['version = "0.1.0"', 'version = "3.1.0"']]);
});

test("stamp desktop writes the workspace crates' versions in Cargo.lock and nothing else", () => {
  const root = copyOfDesktopFiles();
  const before = read(root, "Cargo.lock");

  stamp(root, "desktop", "3.1.0", "2.5.0");

  const changes = changedLines(before, read(root, "Cargo.lock"));
  assert.equal(changes.length, 4);
  for (const [old, line] of changes) {
    assert.equal(old, 'version = "0.1.0"');
    assert.equal(line, 'version = "3.1.0"');
  }
  const names = [...read(root, "Cargo.lock").matchAll(/name = "([^"]+)"\nversion = "3\.1\.0"/g)].map((m) => m[1]);
  assert.deepEqual(names.sort(), ["time-to-present", "ttp-core", "ttp-server", "ttp-stt-sidecar"]);
});

test("stamp desktop points the template at the Client range and nothing else there", () => {
  const root = copyOfDesktopFiles();
  const path = "templates/presentation/package.json";
  const before = readJson(root, path);

  stamp(root, "desktop", "3.1.0", "2.5.0");

  const after = readJson(root, path);
  assert.equal(after.dependencies["@time-to-present/client"], "^2.5.0");
  after.dependencies["@time-to-present/client"] = before.dependencies["@time-to-present/client"];
  assert.deepEqual(after, before);
});

test("stamp desktop is idempotent", () => {
  const root = copyOfDesktopFiles();
  stamp(root, "desktop", "3.1.0", "2.5.0");
  const once = desktopFiles.map((file) => read(root, file));

  stamp(root, "desktop", "3.1.0", "2.5.0");

  assert.deepEqual(desktopFiles.map((file) => read(root, file)), once);
});

test("stamp desktop rejects a missing or malformed version without touching the files", () => {
  const root = copyOfDesktopFiles();
  const before = desktopFiles.map((file) => read(root, file));

  for (const args of [["desktop"], ["desktop", "3.1.0"], ["desktop", "3.1.0", "latest"], ["desktop", "x", "2.5.0"]]) {
    assert.notEqual(stamp(root, ...args).status, 0, args.join(" "));
  }
  assert.deepEqual(desktopFiles.map((file) => read(root, file)), before);
});
