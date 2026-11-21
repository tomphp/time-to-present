import type { EventMap, NamedEvent, ScriptWord, StreamEvent, Word } from "./protocol";

/** What `simulate()` plays: the Script in the `/_ttp/v1/script` shape, its versions and end optional. */
export interface SimulatedScript<Events extends EventMap = EventMap> {
  words: ScriptWord[];
  namedEvents: NamedEvent<Events>[];
  scriptEnd?: number;
  scriptVersion?: number;
}

export type Timeline = ReturnType<typeof timelineOf>;

const byTime = <T>(time: (item: T) => number) => (a: T, b: T) => time(a) - time(b);

/** The Script as the clock plays it: Words in start order, Named Events by Script Time then Script order. */
export function timelineOf(script: SimulatedScript) {
  const words = [...script.words].sort(byTime((word) => word.start));
  const events = script.namedEvents
    .map((event) => ({ ...event, data: event.data ?? null, scriptTime: Math.max(0, event.scriptTime) }))
    .sort(byTime((event) => event.scriptTime));
  const lastWord = words.at(-1);
  const end = script.scriptEnd ?? Math.max(lastWord ? lastWord.start + lastWord.duration : 0, ...events.map((event) => event.scriptTime));

  const wordPayload = ({ id, text, start, duration }: Word): Word => ({ id, text, start, duration });

  /** Every Word and Named Event in (`after`, `upTo`], a Word first at equal times. */
  const crossed = (after: number, upTo: number): StreamEvent[] => {
    const within = (time: number) => after < time && time <= upTo;
    const crossedWords = words.filter((word) => within(word.start));
    const crossedEvents = events.filter((event) => within(event.scriptTime));
    const merged: StreamEvent[] = [];
    while (crossedWords.length || crossedEvents.length) {
      const wordFirst = crossedWords.length > 0 && (!crossedEvents.length || crossedWords[0].start <= crossedEvents[0].scriptTime);
      merged.push(
        wordFirst
          ? { type: "word", ...wordPayload(crossedWords.shift()!) }
          : { type: "namedEvent", ...crossedEvents.shift()! },
      );
    }
    return merged;
  };

  return {
    version: script.scriptVersion ?? 1,
    words,
    events,
    end,
    crossed,
    /** The Word being spoken at `time`, else the last one started. */
    currentWord(time: number): Word | null {
      const started = words.filter((word) => word.start <= time).at(-1);
      return started ? wordPayload(started) : null;
    },
    passedEvents: (time: number) => events.filter((event) => event.scriptTime <= time),
  };
}
