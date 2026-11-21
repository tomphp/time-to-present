import { describe, expect, it } from "vitest";
import { scriptLayout } from "./script-view";
import type { ScriptWord } from "./session";

const word = (id: string, text: string, breakAfter?: ScriptWord["breakAfter"]): ScriptWord => ({
  id,
  text,
  start: 0,
  duration: 300,
  breakAfter,
});

describe("scriptLayout", () => {
  it("lays out an empty Script as no paragraphs", () => {
    expect(scriptLayout([])).toEqual([]);
  });

  it("keeps Words without breaks on one line", () => {
    const layout = scriptLayout([word("w1", "Hello,"), word("w2", "world.")]);

    expect(layout).toEqual([[[{ id: "w1", text: "Hello," }, { id: "w2", text: "world." }]]]);
  });

  it("starts a new line after a line break and a new paragraph after a paragraph break", () => {
    const layout = scriptLayout([
      word("w1", "One", "line"),
      word("w2", "two", "paragraph"),
      word("w3", "three"),
    ]);

    expect(layout).toEqual([
      [[{ id: "w1", text: "One" }], [{ id: "w2", text: "two" }]],
      [[{ id: "w3", text: "three" }]],
    ]);
  });

  it("drops the empty line a break on the last Word would leave", () => {
    expect(scriptLayout([word("w1", "End.", "paragraph")])).toEqual([[[{ id: "w1", text: "End." }]]]);
  });
});
