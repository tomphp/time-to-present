# @time-to-present/client

The library a Presentation App uses to follow a Performance: it connects to the
event stream Time to Present serves and folds Named Events into app state.

```ts
import { connect } from "@time-to-present/client";

const client = connect<{ slide: { index: number } }>();
const deck = client.fold(0, { slide: (_, event) => event.data.index });
deck.subscribe(({ state, live }) => showSlide(state, { animate: live }));
client.onFrame((scriptTime) => moveProgressBar(scriptTime));
```

Derive state with a Fold: it is rebuilt on every Snapshot, so seeks, late joins and
reconnects are always right. The raw `on…` hooks only hear live events and are not
seek-safe.

## Without the desktop app

`simulate(script)` runs the Performance clock in the page over a Script in the
`/_ttp/v1/script` shape and speaks the same protocol, so the app runs unchanged:

```ts
import script from "./script.json";
import { connect, simulate } from "@time-to-present/client";

const simulator = simulate(script);
simulator.keyboard(); // the Teleprompter's Performance keys
const client = connect({ source: simulator });
```

Drive it with `play`, `pause`, `seek`, `setSpeed` and `reset`. In tests, pass
`{ clock: "manual" }` and move time with `advance(ms)`.
