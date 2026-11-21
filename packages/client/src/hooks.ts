import type { StreamState } from "./stream-state";
import type { ClockChange, EventMap, EventName, NamedEvent, Snapshot, Word } from "./protocol";
import type { Unsubscribe } from "./store";

/**
 * One-shot reactions to live events. None is ever called for past events, so they are not
 * seek-safe: a seek or a late join skips them. Derive state with a Fold instead.
 */
export interface Hooks<Events extends EventMap> {
  /** Each Word as it starts. */
  onWord(handler: (word: Word) => void): Unsubscribe;
  /** Each live Named Event. */
  onNamedEvent(handler: (event: NamedEvent<Events>) => void): Unsubscribe;
  /** Each live Named Event called `name`. */
  onNamedEvent<Name extends EventName<Events>>(
    name: Name,
    handler: (event: NamedEvent<Events, Name>) => void,
  ): Unsubscribe;
  /** Each clock change: play, pause, seek, speed, end or reset. */
  onClock(handler: (change: ClockChange) => void): Unsubscribe;
  /** Each Tick's Script Time, ten times a second while playing. */
  onTick(handler: (scriptTime: number) => void): Unsubscribe;
  /** Each Snapshot: on connect, seek and Script edit. */
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
