#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sidecar = "ttp-stt-sidecar";
const suffix = process.platform === "win32" ? ".exe" : "";
const engine = process.platform === "darwin" ? "metal" : "whisper";

const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host: (.+)$/m)[1];

execFileSync(
  "cargo",
  ["build", "-p", sidecar, "--bin", sidecar, "--release", "--features", engine],
  { cwd: root, stdio: "inherit" },
);

const binaries = join(root, "apps/desktop/src-tauri/binaries");
mkdirSync(binaries, { recursive: true });
copyFileSync(
  join(root, "target/release", sidecar + suffix),
  join(binaries, `${sidecar}-${host}${suffix}`),
);
