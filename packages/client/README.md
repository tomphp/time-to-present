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

## Seek safety

A seek sends one Snapshot and never replays what it skipped, and a late join or reconnect
starts the same way. So derive everything on screen from a Fold (or the `clock` and
`currentWord` stores), never from `onNamedEvent`, `onWord`, `onClock`, `onTick` or
`onSnapshot` alone: those hear live events only and are not seek-safe. Use `live` from a
Fold to animate only changes that really happened just now.

## Developing your app

Run your dev server and let it reach the desktop app's stream. With Vite, proxy `/_ttp`:

```ts
// vite.config.ts
export default defineConfig({
  server: { proxy: { "/_ttp": "http://localhost:4747" } },
});
```

`connect()` then works unchanged at the dev server's origin. The editor's toolbar shows the
port if 4747 was taken. Build into the Presentation's `app/` to perform
(see [docs/folder-format.md](docs/folder-format.md)).

With no desktop app, use `simulate()` as above. `connection` is `reconnecting` while the
stream is lost or the Presentation is closed, and `error` holds why a Client closed itself,
such as a protocol version mismatch.

## Frameworks

Every `Store` has `subscribe(fn)` (called at once, then on each change) and `get()`, bound,
and `get()` keeps returning the same object until the value changes. Create the Client once,
outside components.

**React**: `useSyncExternalStore` takes a store as it is.

```tsx
const useStore = <T,>(store: Store<T>) => useSyncExternalStore(store.subscribe, store.get);
const deck = useStore(client.fold(0, { slide: (_, event) => event.data.index }));
```

Create the Fold at module level, not in render, or it is rebuilt every render. See
[examples/react-slides.tsx](examples/react-slides.tsx).

**Svelte**: a Store is a Svelte store; use `$` directly.

```svelte
<script>
  const deck = client.fold(0, { slide: (_, event) => event.data.index });
</script>
<h1 class:animate={$deck.live}>{slides[$deck.state]}</h1>
```

**Vue**: wrap a store in a `ref` and unsubscribe on unmount.

```ts
function useStore<T>(store: Store<T>) {
  const value = shallowRef(store.get());
  const stop = store.subscribe((next) => (value.value = next));
  onScopeDispose(stop);
  return value;
}
```

**No framework**: see [examples/vanilla-slides.ts](examples/vanilla-slides.ts). For captions
that follow the spoken Word, see [examples/word-captions.ts](examples/word-captions.ts).

## More

- [docs/protocol.md](docs/protocol.md): the stream and Script over HTTP, for non-JS clients
- [docs/folder-format.md](docs/folder-format.md): the Presentation folder, including optional `app-src/`
- [llms.txt](llms.txt) and [llms-full.txt](llms-full.txt): the same for coding agents
- [examples/](examples): each smoke-tested against the Simulator
