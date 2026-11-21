import type { EventMap, Script } from "./protocol";
import type { Source } from "./source";
import { readonly, writable, type Store } from "./store";

/** Fetches the Script on first subscribe, and again whenever `scriptVersion` changes. */
export function scriptStore<Events extends EventMap>(
  source: Source,
  scriptVersion: Store<number | null>,
): Store<Script<Events> | null> {
  let wanted = false;
  let fetchedVersion: number | null = null;
  let latestRequest = 0;

  const refresh = () => {
    const version = scriptVersion.get();
    if (!wanted || version === null || version === fetchedVersion) return;
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
    wanted = true;
    refresh();
  });
  scriptVersion.subscribe(refresh);
  return readonly(script);
}
