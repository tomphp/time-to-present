import type { Performance } from "./performance";
import type { EventMap, EventName, NamedEvent } from "./protocol";
import { readonly, writable, type Store } from "./store";

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
  performance: Performance,
  initial: State,
  reducers: Reducers<Events, State>,
): Store<Folded<State>> {
  const reducerFor = (name: string) =>
    Object.hasOwn(reducers, name) ? (reducers as Record<string, Reducer<State>>)[name] : undefined;
  const reduce = (state: State, event: NamedEvent) => {
    const reducer = reducerFor(event.name);
    return reducer ? reducer(state, event) : state;
  };
  const rebuilt = (passed: NamedEvent[]) => ({ state: passed.reduce(reduce, initial), live: false });

  const folded = writable<Folded<State>>(rebuilt(performance.passed()));
  performance.rebuilds.on((passed) => folded.set(rebuilt(passed)));
  performance.namedEvents.on((event) => {
    const reducer = reducerFor(event.name);
    if (reducer) folded.set({ state: reducer(folded.get().state, event), live: true });
  });
  return readonly(folded);
}
