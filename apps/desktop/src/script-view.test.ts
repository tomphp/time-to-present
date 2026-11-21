import { describe, expect, it } from "vitest";
import { scriptLayout } from "./script-view";
import type { ScriptWord } from "./session";

const word = (
  id: string,
  text: string,
  breakAfter?: ScriptWord["breakAfter"],
  confidence: number | null = null,
): ScriptWord => ({ id, text, start: 0, duration: 300, confidence, breakAfter });

const laidOut = (id: string, text: string, lowConfidence = false) => ({ id, text, lowConfidence });

describe("scriptLayout", () => {
  it("lays out an empty Script as no paragraphs", () => {
    expect(scriptLayout([])).toEqual([]);
  });

  it("keeps Words without breaks on one line", () => {
    const layout = scriptLayout([word("w1", "Hello,"), word("w2", "world.")]);

    expect(layout).toEqual([[[laidOut("w1", "Hello,"), laidOut("w2", "world.")]]]);
  });

  it("starts a new line after a line break and a new paragraph after a paragraph break", () => {
    const layout = scriptLayout([
      word("w1", "One", "line"),
      word("w2", "two", "paragraph"),
      word("w3", "three"),
    ]);

    expect(layout).toEqual([
      [[laidOut("w1", "One")], [laidOut("w2", "two")]],
      [[laidOut("w3", "three")]],
    ]);
  });

  it("drops the empty line a break on the last Word would leave", () => {
    expect(scriptLayout([word("w1", "End.", "paragraph")])).toEqual([[[laidOut("w1", "End.")]]]);
  });

  it("marks a transcribed Word with low confidence, never a typed one", () => {
    const layout = scriptLayout([
      word("w1", "sure", undefined, 0.95),
      word("w2", "hmm", undefined, 0.4),
      word("w3", "typed", undefined, null),
    ]);

    expect(layout[0][0].map((w) => w.lowConfidence)).toEqual([false, true, false]);
  });
});
