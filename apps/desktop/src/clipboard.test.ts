import { describe, expect, it } from "vitest";
import type { Caret, Range } from "./caret";
import { caretAfterPaste, passageText, pasteAt, selectedWords } from "./clipboard";
import type { ScriptWord } from "./session";
import { scriptWord } from "./test-words";

const word = (id: string, text: string, breakAfter?: ScriptWord["breakAfter"]) => scriptWord(id, text, { breakAfter });

const words = [word("w1", "Hello,", "line"), word("w2", "world.", "paragraph"), word("w3", "Typed")];
const range = (start: Caret, end: Caret): Range => ({ start, end });

describe("the Words a selection takes", () => {
  it("are every Word it covers any of", () => {
    expect(selectedWords(words, range({ word: "w1", offset: 2 }, { word: "w2", offset: 1 }))).toEqual(["w1", "w2"]);
  });

  it("leave out a Word it only touches at an edge", () => {
    expect(selectedWords(words, range({ word: "w1", offset: 6 }, { word: "w3", offset: 0 }))).toEqual(["w2"]);
  });

  it("run between slots to the Words between them", () => {
    expect(selectedWords(words, range({ slotAfter: null }, { slotAfter: "w2" }))).toEqual(["w1", "w2"]);
  });

  it("are none for a collapsed caret", () => {
    expect(selectedWords(words, range({ word: "w2", offset: 3 }, { word: "w2", offset: 3 }))).toEqual([]);
  });
});

describe("a passage's plain text", () => {
  it("separates Words by spaces and ends lines and paragraphs as their breaks do", () => {
    expect(passageText(words)).toBe("Hello,\nworld.\n\nTyped");
  });

  it("drops the last Word's break", () => {
    expect(passageText(words.slice(0, 2))).toBe("Hello,\nworld.");
  });
});

describe("where a paste goes", () => {
  const after = (caret: Caret) => pasteAt(words, range(caret, caret));

  it("is after the slot's Word", () => {
    expect(after({ slotAfter: "w2" })).toEqual({ after: "w2", replacing: [] });
  });

  it("is before a Word the caret is at the start of", () => {
    expect(after({ word: "w2", offset: 0 }).after).toBe("w1");
    expect(after({ word: "w1", offset: 0 }).after).toBeNull();
  });

  it("is after a Word the caret is inside or at the end of", () => {
    expect(after({ word: "w2", offset: 3 }).after).toBe("w2");
    expect(after({ word: "w2", offset: 6 }).after).toBe("w2");
  });

  it("over a selection replaces the Words it covers, going after the Word before them", () => {
    expect(pasteAt(words, range({ word: "w2", offset: 1 }, { word: "w3", offset: 2 }))).toEqual({
      after: "w1",
      replacing: ["w2", "w3"],
    });
  });
});

describe("the caret after a paste", () => {
  it("ends the last pasted Word", () => {
    const next = [words[0], word("p1", "new"), word("p2", "words"), words[2]];
    expect(caretAfterPaste(words, next, { after: "w1", replacing: ["w2"] })).toEqual({ word: "p2", offset: 5 });
  });

  it("ends the last pasted Word at the start of the Script", () => {
    const next = [word("p1", "new"), ...words];
    expect(caretAfterPaste(words, next, { after: null, replacing: [] })).toEqual({ word: "p1", offset: 3 });
  });
});
