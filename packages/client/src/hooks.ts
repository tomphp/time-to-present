import type { StreamState } from "./stream-state.js";
import type { ClockChange, EventMap, EventName, NamedEvent, Snapshot, Word } from "./protocol.js";
import type { Unsubscribe } from "./store.js";

/**
 * One-shot reactions to live events. None is ever called for past events, so they are not
 * seek-safe: a seek or a late join skips them. Derive state with a Fold instead.
 */
export interface Hooks<Events extends EventMap> {
  /** Each Word as it starts. Not seek-safe. */
  onWord(handler: (word: Word) => void): Unsubscribe;
  /** Each live Named Event. Not seek-safe: a seek skips the ones it passes. */
  onNamedEvent(handler: (event: NamedEvent<Events>) => void): Unsubscribe;
  /** Each live Named Event called `name`. Not seek-safe: a seek skips the ones it passes. */
  onNamedEvent<Name extends EventName<Events>>(
    name: Name,
    handler: (event: NamedEvent<Events, Name>) => void,
  ): Unsubscribe;
  /** Each clock change: play, pause, seek, speed, end or reset. Not seek-safe; read the `clock` store for state. */
  onClock(handler: (change: ClockChange) => void): Unsubscribe;
  /** Each Tick's Script Time, ten times a second while playing. Not seek-safe; use `onFrame` for motion. */
  onTick(handler: (scriptTime: number) => void): Unsubscribe;
  /** Each Snapshot: on connect, seek and Script edit. The place to reset anything a hook built up. */
  onSnapshot(handler: (snapshot: Snapshot<Events>) => void): Unsubscribe;
}

type AnyHandler = (event: NamedEvent) => void;

export function hooks<Events extends EventMap>(stream: StreamState): Hooks<Events> {
  return {
    onWord: (handler) => stream.words.on(handler),
    onNamedEvent(...args: [AnyHandler] | [string, AnyHandler]): Unsubscribe {
      if (args.length === 1) return stream.namedEvents.on(args[0]);
      const [name, handler] = args;
      return stream.namedEvents.on((event) => {
        if (event.name === name) handler(event);
      });
    },
    onClock: (handler) => stream.clockChanges.on(handler),
    onTick: (handler) => stream.ticks.on(handler),
    onSnapshot: (handler) => stream.snapshots.on(handler as (snapshot: Snapshot) => void),
  } as Hooks<Events>;
}
