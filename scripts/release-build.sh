#!/usr/bin/env bash
set -euo pipefail

identity="${SIGNING_IDENTITY:-Time to Present Local}"

if ! security find-identity -v -p codesigning | grep -q "\"$identity\""; then
  echo "No code signing identity named \"$identity\" in your keychain." >&2
  echo "It must exist and be trusted for Code Signing. See docs/release.md for how to make one." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
APPLE_SIGNING_IDENTITY="$identity" npm run tauri -w @time-to-present/desktop -- build

app="target/release/bundle/macos/Time to Present.app"
codesign --verify --strict --verbose=2 "$app"
codesign -dr - "$app"
echo "Built $app"
