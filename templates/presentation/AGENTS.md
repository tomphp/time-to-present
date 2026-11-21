# Presentation App

Read `node_modules/@time-to-present/client/llms.txt` first: it indexes the client library's API and the event stream protocol.

- Derive slide state with a Fold (`client.fold`), never from the raw `on…` hooks: a Fold stays right across seeks and reconnects.
- Add every Named Event to the `Events` map in `src/events.ts`.
- `npm run dev:sim` runs against the in-page Simulator, with no desktop app. `npm run dev` proxies `/_ttp` to the desktop app on localhost:4747.
- `npm run build` writes `../app`, which Time to Present serves.
