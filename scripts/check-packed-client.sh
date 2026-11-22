#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
manifest="$repo/packages/client/package.json"
cp "$manifest" "$work/package.json.orig"
trap 'cp "$work/package.json.orig" "$manifest"; rm -rf "$work"' EXIT
package=@time-to-present/client

node "$repo/scripts/stamp.mjs" client 0.0.0-packcheck
npm run build -w "$package" --prefix "$repo"
npm pack -w "$package" --pack-destination "$work" --prefix "$repo"

consumer="$work/consumer"
mkdir "$consumer"
cd "$consumer"
echo '{ "name": "consumer", "private": true, "type": "module" }' > package.json
npm install --no-audit --no-fund "$work"/time-to-present-client-*.tgz

cat > run.mjs <<'JS'
import * as client from "@time-to-present/client";

const entry = import.meta.resolve("@time-to-present/client");
if (!entry.endsWith(".js")) throw new Error(`resolved to ${entry}, not compiled JavaScript`);
if (typeof client.connect !== "function" || typeof client.simulate !== "function") {
  throw new Error(`missing exports, found ${Object.keys(client)}`);
}
JS
node --experimental-strip-types run.mjs

cat > consumer.ts <<'TS'
import { connect, simulate, type Client, type Word } from "@time-to-present/client";

const client: Client = connect({ source: simulate({ words: [], namedEvents: [] }, { clock: "manual" }) });
export const current: Word | null = client.currentWord.get();
TS
cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true,
    "types": []
  },
  "files": ["consumer.ts"]
}
JSON
"$repo/node_modules/.bin/tsc" -p . --listFiles > files.txt
if grep -E 'node_modules/@time-to-present/client/.*(\.tsx?)$' files.txt | grep -vq '\.d\.ts$'; then
  echo "the packed Client resolved to .ts sources" >&2
  exit 1
fi
grep -q 'node_modules/@time-to-present/client/dist/index.d.ts' files.txt

fixtures="$repo/crates/core/tests/fixtures"
ttp="$consumer/node_modules/.bin/ttp"
expected_text=$'Good morning, everyone.\n\nToday we rehearse\nwith a teleprompter.'
expected_events='[
  {
    "id": "e1",
    "name": "slide",
    "data": {
      "index": 1
    },
    "scriptTime": 0
  },
  {
    "id": "e2",
    "name": "slide",
    "data": {
      "index": 2
    },
    "scriptTime": 2500
  }
]'
[ "$("$ttp" text "$fixtures/rehearsal")" = "$expected_text" ] || { echo "ttp text printed the wrong Script Text" >&2; exit 1; }
[ "$("$ttp" events "$fixtures/rehearsal" --json)" = "$expected_events" ] || { echo "ttp events --json printed the wrong events" >&2; exit 1; }
if "$ttp" text "$fixtures/from-the-future" 2> /dev/null; then
  echo "ttp read a presentation.json newer than it knows" >&2
  exit 1
fi
