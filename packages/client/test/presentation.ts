/** The `words` and `namedEvents` of a `presentation.json`, as the protocol fixtures give them. */
export interface Presentation {
  words: { id: string; text: string; gap: number; duration: number; breakAfter?: "line" | "paragraph" }[];
  namedEvents: { id: string; name: string; data?: unknown; anchor: string; offset: number }[];
}

/** The Script as `/_ttp/v1/script` would serve it: absolute Word starts and resolved Named Events. */
export function scriptOf({ words, namedEvents }: Presentation) {
  let previousEnd = 0;
  const timed = words.map(({ id, text, gap, duration, breakAfter }) => {
    const start = previousEnd + gap;
    previousEnd = start + duration;
    return { id, text, start, duration, ...(breakAfter && { breakAfter }) };
  });
  const startOf = (anchor: string) => (anchor === "scriptStart" ? 0 : timed.find((word) => word.id === anchor)?.start);
  const resolved = namedEvents.flatMap(({ id, name, data = null, anchor, offset }) => {
    const anchorTime = startOf(anchor);
    return anchorTime === undefined ? [] : [{ id, name, data, scriptTime: Math.max(0, anchorTime + offset) }];
  });
  return { words: timed, namedEvents: resolved.sort((a, b) => a.scriptTime - b.scriptTime) };
}
