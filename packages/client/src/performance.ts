import { channel } from "./channel";
import type { Clock, ClockChange, NamedEvent, Snapshot, StreamEvent, Word } from "./protocol";
import { writable } from "./store";

const READY: Clock = { state: "ready", scriptTime: 0, speed: 1 };

export type Performance = ReturnType<typeof followPerformance>;

/** What the stream says the Performance has reached, kept for stores, Folds and hooks. */
export function followPerformance() {
  const clock = writable<Clock>(READY);
  const currentWord = writable<Word | null>(null);
  const scriptVersion = writable<number | null>(null);
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
        const { type: _, ...snapshot } = event;
        scriptVersion.set(snapshot.scriptVersion);
        currentWord.set(snapshot.currentWord);
        clock.set(snapshot.clock);
        rebuild(snapshot.passedEvents);
        return channels.snapshots.emit(snapshot);
      }
      case "clock": {
        const { type: _, ...change } = event;
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
        const { type: _, ...word } = event;
        currentWord.set(word);
        return channels.words.emit(word);
      }
      case "namedEvent": {
        const { type: _, ...namedEvent } = event;
        passed = [...passed, namedEvent];
        return channels.namedEvents.emit(namedEvent);
      }
    }
  };

  return { clock, currentWord, scriptVersion, passed: () => passed, receive, ...channels };
}
