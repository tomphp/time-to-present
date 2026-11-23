# Time to Present

A presentation app for macOS and Linux with a built-in teleprompter. The words of the domain
are in [GLOSSARY.md](GLOSSARY.md), and the decisions behind it in [docs/adr](docs/adr).

## Layout

| Path | What it holds |
| --- | --- |
| `apps/desktop` | The Tauri v2 app: webview frontends, with the Tauri shell in `src-tauri` |
| `crates/core` | The Rust core: Script model, Presentation store and Session |
| `crates/server` | The event stream server: the open Presentation's `app/` and SSE stream on `localhost:4747` |
| `crates/stt-sidecar` | The speech-to-text sidecar, speaking [its JSON-lines protocol](docs/stt-sidecar-protocol.md) |
| `packages/client` | `@time-to-present/client`, the library Presentation Apps use |
| `templates/presentation` | The Presentation App source written into new Presentations as `app-src/` |
| `protocol-fixtures` | Event stream fixtures shared by the core and the client's Simulator |

## Commands

```sh
npm install
npm test        # every fast test suite, Rust and TypeScript
npm run typecheck
npm run dev     # run the desktop app
```

Run `npm run build -w @time-to-present/client` before using `npx ttp` in the workspace: the
`ttp` bin is the Client's compiled `dist/cli.js`.

To see a Script without recording one, use Open Folder on
`crates/core/tests/fixtures/hello-world`. To watch the event stream while the
editor's play/pause drives the clock, run `curl -N localhost:4747/_ttp/v1/events`
(the editor's toolbar shows the port if 4747 was taken).

## Logs

The desktop app logs to `time-to-present.log` in its log directory, in debug and release builds,
including panics, errors returned from commands and each step of Perform. It also logs to the
console, where there is one.

| OS | Log file |
| --- | --- |
| macOS | `~/Library/Logs/dev.timetopresent.desktop/time-to-present.log` |
| Windows | `%LOCALAPPDATA%\dev.timetopresent.desktop\logs\time-to-present.log` |
| Linux | `$XDG_DATA_HOME/dev.timetopresent.desktop/logs/time-to-present.log` (`~/.local/share/…` by default) |

Past 1 MB the file is rotated, keeping the two most recent previous files beside it with their date in
the name.
