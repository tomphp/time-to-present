# Presentation folder format

A Presentation is a plain folder:

| Path | What it holds |
| --- | --- |
| `presentation.json` | The title, recordings and Script, versioned by a format number |
| `recordings/` | The audio Recordings the Script's Words point at |
| `app/` | The built Presentation App, served at `/` while you perform |
| `app-src/` | Optional: the source of that app. A new Presentation starts with a Vite + TypeScript starter here; delete it if you build `app/` elsewhere |

Time to Present only reads `app/`. `app-src/` is for you and your coding agent: build it into `../app`.
Files in `app/_ttp/` are never served, because `/_ttp/` is the event stream's.
See [protocol.md](protocol.md) for what the app can follow.
