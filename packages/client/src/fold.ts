import type { StreamState } from "./stream-state.js";
import type { EventMap, EventName, NamedEvent } from "./protocol.js";
import { readonly, writable, type Store } from "./store.js";

/** A Fold's state, and whether it last changed from a live Named Event rather than a Snapshot. */
export interface Folded<State> {
  state: State;
  live: boolean;
}

/** Pure functions from the state and one Named Event to the next state, by event name. */
export type Reducers<Events extends EventMap, State> = {
  [Name in EventName<Events>]?: (state: State, event: NamedEvent<Events, Name>) => State;
};

type Reducer<State> = (state: State, event: NamedEvent) => State;

export function fold<Events extends EventMap, State>(
  stream: StreamState,
  initial: State,
  reducers: Reducers<Events, State>,
): Store<Folded<State>> {
  const reducerFor = (name: string) =>
    Object.hasOwn(reducers, name) ? (reducers as Record<string, Reducer<State>>)[name] : undefined;
  const step = (state: State, event: NamedEvent) => {
    const reducer = reducerFor(event.name);
    return reducer ? { state: reducer(state, event) } : null;
  };
  const rebuilt = (passed: NamedEvent[]) => ({
    state: passed.reduce((state, event) => step(state, event)?.state ?? state, initial),
    live: false,
  });

  const folded = writable<Folded<State>>(rebuilt(stream.passed()));
  stream.rebuilds.on((passed) => folded.set(rebuilt(passed)));
  stream.namedEvents.on((event) => {
    const next = step(folded.get().state, event);
    if (next) folded.set({ state: next.state, live: true });
  });
  return readonly(folded);
}
