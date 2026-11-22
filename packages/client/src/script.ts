import type { EventMap, Script } from "./protocol.js";
import type { Source } from "./source.js";
import { readonly, writable, type Store } from "./store.js";
import type { StreamState } from "./stream-state.js";

/**
 * Fetches the Script on first subscribe, again whenever a Snapshot's `scriptVersion`
 * changes, and on the next Snapshot after a failed fetch.
 */
export function scriptStore<Events extends EventMap>(source: Source, stream: StreamState): Store<Script<Events> | null> {
  let subscribedOnce = false;
  let version: number | null = null;
  let fetchedVersion: number | null = null;
  let latestRequest = 0;

  const refresh = () => {
    if (!subscribedOnce || version === null || version === fetchedVersion) return;
    fetchedVersion = version;
    const request = ++latestRequest;
    source.script().then(
      (fetched) => {
        if (request === latestRequest) script.set(fetched as Script<Events>);
      },
      () => {
        if (request === latestRequest) fetchedVersion = null;
      },
    );
  };

  const script = writable<Script<Events> | null>(null, () => {
    subscribedOnce = true;
    refresh();
  });
  stream.snapshots.on((snapshot) => {
    version = snapshot.scriptVersion;
    refresh();
  });
  return readonly(script);
}
