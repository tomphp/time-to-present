#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
target="$(rustc -vV | sed -n 's/^host: //p')"
cargo build -p ttp-stt-sidecar --bin ttp-stt-sidecar --release --features metal
mkdir -p apps/desktop/src-tauri/binaries
cp target/release/ttp-stt-sidecar "apps/desktop/src-tauri/binaries/ttp-stt-sidecar-$target"
