import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "usage: stamp client <version> [--root <dir>]";
const semver = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function editJson(path, edit) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  edit(json);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}

const commands = {
  client(root, version) {
    editJson(join(root, "packages/client/package.json"), (manifest) => {
      manifest.version = version;
      manifest.exports = { types: "./dist/index.d.ts", default: "./dist/index.js" };
    });
  },
};

function main(argv) {
  const args = [...argv];
  const rootFlag = args.indexOf("--root");
  const root = rootFlag === -1 ? defaultRoot : args.splice(rootFlag, 2)[1];
  const [command, version] = args;
  if (!root || !Object.hasOwn(commands, command) || !semver.test(version ?? "")) {
    console.error(usage);
    process.exit(1);
  }
  commands[command](root, version);
}

main(process.argv.slice(2));
