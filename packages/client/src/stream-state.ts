import { channel } from "./channel.js";
import type { Clock, ClockChange, NamedEvent, Snapshot, StreamEvent, Word } from "./protocol.js";
import { writable } from "./store.js";

const READY: Clock = { state: "ready", scriptTime: 0, speed: 1 };

export type StreamState = ReturnType<typeof trackStream>;

const payload = <E extends StreamEvent>({ type: _, ...rest }: E) => rest;

/** What the stream says the Performance has reached, kept for stores, Folds and hooks. */
export function trackStream() {
  const clock = writable<Clock>(READY);
  const currentWord = writable<Word | null>(null);
  let passed: NamedEvent[] = [];

  const channels = {
    snapshots: channel<Snapshot>(),
    clockChanges: channel<ClockChange>(),
    ticks: channel<number>(),
    words: channel<Word>(),
    namedEvents: channel<NamedEvent>(),
    rebuilds: channel<NamedEvent[]>(),
  };

  const rebuild = (events: NamedEvent[]) => {
    passed = events;
    channels.rebuilds.emit(passed);
  };

  const receive = (event: StreamEvent) => {
    switch (event.type) {
      case "snapshot": {
        const snapshot = payload(event);
        currentWord.set(snapshot.currentWord);
        clock.set(snapshot.clock);
        rebuild(snapshot.passedEvents);
        return channels.snapshots.emit(snapshot);
      }
      case "clock": {
        const change = payload(event);
        if (change.cause === "reset") {
          currentWord.set(null);
          rebuild([]);
        }
        clock.set({ state: change.state, scriptTime: change.scriptTime, speed: change.speed });
        return channels.clockChanges.emit(change);
      }
      case "tick":
        return channels.ticks.emit(event.scriptTime);
      case "word": {
        const word = payload(event);
        currentWord.set(word);
        return channels.words.emit(word);
      }
      case "namedEvent": {
        const namedEvent = payload(event);
        passed = [...passed, namedEvent];
        return channels.namedEvents.emit(namedEvent);
      }
    }
  };

  /** Stops the clock where it is, once nothing is driving it any more. */
  const halt = (scriptTime: number) => {
    if (clock.get().state === "playing") clock.set({ ...clock.get(), state: "paused", scriptTime });
  };

  return { clock, currentWord, passed: () => passed, receive, halt, ...channels };
}
