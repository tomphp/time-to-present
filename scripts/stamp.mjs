import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "usage: stamp client <version> | stamp desktop <version> <client-version> [--root <dir>]";
const semver = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function editJson(path, edit) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  edit(json);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}

function editText(path, edit) {
  writeFileSync(path, edit(readFileSync(path, "utf8")));
}

function replaceOnce(text, pattern, replacement) {
  if (!pattern.test(text)) throw new Error(`stamp: nothing matched ${pattern}`);
  return text.replace(pattern, replacement);
}

function workspaceCrateNames(root, workspaceManifest) {
  const members = workspaceManifest.match(/^members\s*=\s*\[([^\]]*)\]/m)[1].match(/"([^"]+)"/g);
  return members.map((member) => {
    const manifest = readFileSync(join(root, member.slice(1, -1), "Cargo.toml"), "utf8");
    return manifest.match(/^name\s*=\s*"([^"]+)"/m)[1];
  });
}

const commands = {
  client(root, version) {
    editJson(join(root, "packages/client/package.json"), (manifest) => {
      manifest.version = version;
      manifest.exports = { types: "./dist/index.d.ts", default: "./dist/index.js" };
    });
  },
  desktop(root, version, clientVersion) {
    const workspaceManifest = join(root, "Cargo.toml");
    const crateNames = workspaceCrateNames(root, readFileSync(workspaceManifest, "utf8"));
    editText(join(root, "apps/desktop/src-tauri/tauri.conf.json"), (text) =>
      replaceOnce(text, /^(  "version":\s*)"[^"]*"/m, `$1"${version}"`),
    );
    editText(workspaceManifest, (text) =>
      replaceOnce(text, /(\[workspace\.package\][^[]*?\nversion\s*=\s*)"[^"]*"/, `$1"${version}"`),
    );
    editText(join(root, "Cargo.lock"), (text) =>
      crateNames.reduce(
        (locked, name) => replaceOnce(locked, new RegExp(`(name = "${name}"\\nversion = )"[^"]*"`), `$1"${version}"`),
        text,
      ),
    );
    editJson(join(root, "templates/presentation/package.json"), (manifest) => {
      manifest.dependencies["@time-to-present/client"] = `^${clientVersion}`;
    });
  },
};

function main(argv) {
  const args = [...argv];
  const rootFlag = args.indexOf("--root");
  const root = rootFlag === -1 ? defaultRoot : args.splice(rootFlag, 2)[1];
  const [command, ...versions] = args;
  const arity = { client: 1, desktop: 2 }[command];
  if (!root || !arity || versions.length !== arity || !versions.every((version) => semver.test(version))) {
    console.error(usage);
    process.exit(1);
  }
  commands[command](root, ...versions);
}

main(process.argv.slice(2));
