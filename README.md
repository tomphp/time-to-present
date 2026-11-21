# Time to Present

A macOS presentation app with a built-in teleprompter. The words of the domain
are in [GLOSSARY.md](GLOSSARY.md), and the decisions behind it in [docs/adr](docs/adr).

## Layout

| Path | What it holds |
| --- | --- |
| `apps/desktop` | The Tauri v2 app: webview frontends, with the Tauri shell in `src-tauri` |
| `crates/core` | The Rust core: Script model, Presentation store and Session |
| `crates/stt-sidecar` | The speech-to-text sidecar |
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

To see a Script without recording one, use Open Folder on
`crates/core/tests/fixtures/hello-world`.
