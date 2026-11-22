import type { NamedEvent, ScriptWord } from "./protocol.js";

/** The `words` and `namedEvents` of a `presentation.json`: Gaps and anchors, not absolute times. */
export interface PresentationScript {
  words: { id: string; text: string; gap: number; duration: number; breakAfter?: "line" | "paragraph" }[];
  namedEvents: { id: string; name: string; data?: unknown; anchor: string; offset: number }[];
}

/** The Script as `/_ttp/v1/script` serves it, plus the Word each Named Event is anchored to. */
export interface ResolvedScript {
  words: ScriptWord[];
  /** In firing order, ties in file order. */
  namedEvents: NamedEvent[];
  /** The anchor Word of one of `namedEvents`, or null for one anchored to the start of the Script. */
  anchorOf(event: NamedEvent): ScriptWord | null;
}

const SCRIPT_START = "scriptStart";

/**
 * Works out Script Time as the core does: each Word at the last one's end plus its Gap, and
 * each Named Event at its anchor plus its offset.
 */
export function resolveScript({ words, namedEvents }: PresentationScript): ResolvedScript {
  let previousEnd = 0;
  const timed: ScriptWord[] = words.map(({ id, text, gap, duration, breakAfter }) => {
    const start = previousEnd + gap;
    previousEnd = start + duration;
    return { id, text, start, duration, ...(breakAfter && { breakAfter }) };
  });
  const wordsById = new Map([...timed].reverse().map((word) => [word.id, word]));
  const anchors = new Map<NamedEvent, ScriptWord | null>();
  const resolved = namedEvents.flatMap(({ id, name, data = null, anchor, offset }) => {
    const anchorWord = anchor === SCRIPT_START ? null : wordsById.get(anchor);
    if (anchorWord === undefined) return [];
    const event: NamedEvent = { id, name, data, scriptTime: Math.max(0, (anchorWord?.start ?? 0) + offset) };
    anchors.set(event, anchorWord);
    return [event];
  });
  return {
    words: timed,
    namedEvents: resolved.sort((a, b) => a.scriptTime - b.scriptTime),
    anchorOf: (event) => anchors.get(event) ?? null,
  };
}
