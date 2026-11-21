import { describe, expect, it } from "vitest";
import type { Caret, Range } from "./caret";
import { passageText, pasteAfter, selectedWords } from "./clipboard";
import type { ScriptWord } from "./session";

const word = (id: string, text: string, breakAfter?: ScriptWord["breakAfter"]): ScriptWord => ({
  id,
  text,
  start: 0,
  duration: 300,
  confidence: null,
  breakAfter,
});

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
  it("is after the slot's Word", () => {
    expect(pasteAfter(words, { slotAfter: "w2" })).toBe("w2");
  });

  it("is before a Word the caret is at the start of", () => {
    expect(pasteAfter(words, { word: "w2", offset: 0 })).toBe("w1");
    expect(pasteAfter(words, { word: "w1", offset: 0 })).toBeNull();
  });

  it("is after a Word the caret is inside or at the end of", () => {
    expect(pasteAfter(words, { word: "w2", offset: 3 })).toBe("w2");
    expect(pasteAfter(words, { word: "w2", offset: 6 })).toBe("w2");
  });
});
