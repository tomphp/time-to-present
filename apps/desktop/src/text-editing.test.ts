import { describe, expect, it } from "vitest";
import type { ScriptWord } from "./session";
import { scriptWord } from "./test-words";
import { resolveCaret, type Caret, type Range } from "./caret";
import { applyInput, type Input } from "./text-editing";

const word = (id: string, text: string, breakAfter?: ScriptWord["breakAfter"]): ScriptWord =>
  scriptWord(id, text, { breakAfter });

const words = [word("w1", "Hello,"), word("w2", "world.", "paragraph"), word("w3", "Typed")];
const at = (caret: Caret): Range => ({ start: caret, end: caret });
const type = (text: string): Input => ({ type: "insertText", text });
const backspace: Input = { type: "deleteBackward" };
const forwardDelete: Input = { type: "deleteForward" };
const wordBackspace: Input = { type: "deleteWordBackward" };
const wordForwardDelete: Input = { type: "deleteWordForward" };
const enter: Input = { type: "insertBreak" };

describe("typing text", () => {
  it("inside a Word corrects it and moves the caret past the text", () => {
    expect(applyInput(words, at({ word: "w1", offset: 1 }), type("u"))).toEqual({
      edit: { kind: "correct", word: "w1", text: "Huello," },
      caret: { word: "w1", offset: 2 },
    });
  });

  it("in a slot inserts a typed Word after the slot's Word", () => {
    expect(applyInput(words, at({ slotAfter: "w1" }), type("b"))).toEqual({
      edit: { kind: "insertWord", after: "w1", text: "b" },
      caret: { wordAfter: "w1", offset: 1 },
    });
  });

  it("in the slot at the start inserts the first Word", () => {
    expect(applyInput([], at({ slotAfter: null }), type("F"))).toEqual({
      edit: { kind: "insertWord", after: null, text: "F" },
      caret: { wordAfter: null, offset: 1 },
    });
  });

  it("over a selection inside one Word replaces the selected text", () => {
    const range: Range = { start: { word: "w1", offset: 1 }, end: { word: "w1", offset: 5 } };

    expect(applyInput(words, range, type("i"))).toEqual({
      edit: { kind: "correct", word: "w1", text: "Hi," },
      caret: { word: "w1", offset: 2 },
    });
  });

  it("over a selection across Words trims both ends and joins the text to the first", () => {
    const range: Range = { start: { word: "w1", offset: 3 }, end: { word: "w2", offset: 2 } };

    expect(applyInput(words, range, type("p"))).toEqual({
      edit: {
        kind: "batch",
        edits: [
          { kind: "correct", word: "w1", text: "Help" },
          { kind: "correct", word: "w2", text: "rld." },
        ],
      },
      caret: { word: "w1", offset: 4 },
    });
  });

  it("over a selection from a slot inserts the text there and removes what was selected", () => {
    const range: Range = { start: { slotAfter: "w1" }, end: { word: "w3", offset: 1 } };

    expect(applyInput(words, range, type("x"))).toEqual({
      edit: {
        kind: "batch",
        edits: [
          { kind: "correct", word: "w3", text: "yped" },
          { kind: "insertWord", after: "w1", text: "x" },
          { kind: "delete", words: ["w2"] },
        ],
      },
      caret: { wordAfter: "w1", offset: 1 },
    });
  });

  it("ignores text with whitespace in it", () => {
    expect(applyInput(words, at({ word: "w1", offset: 1 }), type("a b"))).toBeNull();
  });
});

describe("typing a space", () => {
  it("inside a Word splits it and puts the caret at the start of the new Word", () => {
    expect(applyInput(words, at({ word: "w2", offset: 2 }), type(" "))).toEqual({
      edit: { kind: "split", word: "w2", at: 2 },
      caret: { wordAfter: "w2", offset: 0 },
    });
  });

  it("at the end of a Word opens a slot after it without editing", () => {
    expect(applyInput(words, at({ word: "w1", offset: 6 }), type(" "))).toEqual({
      caret: { slotAfter: "w1" },
    });
  });

  it("at the start of a Word opens a slot before it", () => {
    expect(applyInput(words, at({ word: "w2", offset: 0 }), type(" "))).toEqual({
      caret: { slotAfter: "w1" },
    });
    expect(applyInput(words, at({ word: "w1", offset: 0 }), type(" "))).toEqual({
      caret: { slotAfter: null },
    });
  });

  it("in a slot does nothing", () => {
    expect(applyInput(words, at({ slotAfter: "w1" }), type(" "))).toBeNull();
  });

  it("over a selection inside a Word removes it and splits there", () => {
    const range: Range = { start: { word: "w1", offset: 1 }, end: { word: "w1", offset: 5 } };

    expect(applyInput(words, range, type(" "))).toEqual({
      edit: {
        kind: "batch",
        edits: [
          { kind: "correct", word: "w1", text: "H," },
          { kind: "split", word: "w1", at: 1 },
        ],
      },
      caret: { wordAfter: "w1", offset: 0 },
    });
  });
});

describe("backspace", () => {
  it("inside a Word removes the character before the caret", () => {
    expect(applyInput(words, at({ word: "w1", offset: 2 }), backspace)).toEqual({
      edit: { kind: "correct", word: "w1", text: "Hllo," },
      caret: { word: "w1", offset: 1 },
    });
  });

  it("on the last character deletes the Word and lands at the end of the one before", () => {
    expect(applyInput([word("w1", "a"), word("w2", "b")], at({ word: "w2", offset: 1 }), backspace)).toEqual({
      edit: { kind: "delete", words: ["w2"] },
      caret: { word: "w1", offset: 1 },
    });
    expect(applyInput([word("w1", "a")], at({ word: "w1", offset: 1 }), backspace)).toEqual({
      edit: { kind: "delete", words: ["w1"] },
      caret: { slotAfter: null },
    });
  });

  it("at the start of a Word merges it into the one before", () => {
    expect(applyInput(words, at({ word: "w3", offset: 0 }), backspace)).toEqual({
      edit: { kind: "setBreak", word: "w2", breakAfter: "line" },
      caret: { word: "w3", offset: 0 },
    });
    expect(applyInput(words, at({ word: "w2", offset: 0 }), backspace)).toEqual({
      edit: { kind: "merge", word: "w1" },
      caret: { word: "w1", offset: 6 },
    });
  });

  it("at the start of the first Word does nothing", () => {
    expect(applyInput(words, at({ word: "w1", offset: 0 }), backspace)).toBeNull();
  });

  it("in a slot closes it and returns to the end of the Word before", () => {
    expect(applyInput(words, at({ slotAfter: "w1" }), backspace)).toEqual({
      caret: { word: "w1", offset: 6 },
    });
    expect(applyInput(words, at({ slotAfter: null }), backspace)).toBeNull();
  });

  it("over a selection across Words trims the ends and deletes the Words between", () => {
    const range: Range = { start: { word: "w1", offset: 3 }, end: { word: "w3", offset: 2 } };

    expect(applyInput(words, range, backspace)).toEqual({
      edit: {
        kind: "batch",
        edits: [
          { kind: "correct", word: "w1", text: "Hel" },
          { kind: "correct", word: "w3", text: "ped" },
          { kind: "delete", words: ["w2"] },
        ],
      },
      caret: { word: "w1", offset: 3 },
    });
  });

  it("over whole Words deletes them in one go and lands where they were", () => {
    const range: Range = { start: { word: "w1", offset: 0 }, end: { word: "w2", offset: 6 } };

    expect(applyInput(words, range, backspace)).toEqual({
      edit: { kind: "delete", words: ["w1", "w2"] },
      caret: { slotAfter: null },
    });
  });

  it("over a selection from a slot to inside a Word keeps that Word's tail", () => {
    const range: Range = { start: { slotAfter: "w1" }, end: { word: "w3", offset: 1 } };

    expect(applyInput(words, range, backspace)).toEqual({
      edit: {
        kind: "batch",
        edits: [
          { kind: "correct", word: "w3", text: "yped" },
          { kind: "delete", words: ["w2"] },
        ],
      },
      caret: { word: "w3", offset: 0 },
    });
  });

  it("by whole Word removes the text before the caret, or acts like backspace at the start", () => {
    expect(applyInput(words, at({ word: "w1", offset: 3 }), wordBackspace)).toEqual({
      edit: { kind: "correct", word: "w1", text: "lo," },
      caret: { word: "w1", offset: 0 },
    });
    expect(applyInput(words, at({ word: "w2", offset: 0 }), wordBackspace)).toEqual({
      edit: { kind: "merge", word: "w1" },
      caret: { word: "w1", offset: 6 },
    });
  });
});

describe("forward delete", () => {
  it("inside a Word removes the character after the caret", () => {
    expect(applyInput(words, at({ word: "w1", offset: 0 }), forwardDelete)).toEqual({
      edit: { kind: "correct", word: "w1", text: "ello," },
      caret: { word: "w1", offset: 0 },
    });
  });

  it("at the end of a Word steps its break down, then merges the next Word in", () => {
    expect(applyInput(words, at({ word: "w2", offset: 6 }), forwardDelete)).toEqual({
      edit: { kind: "setBreak", word: "w2", breakAfter: "line" },
      caret: { word: "w2", offset: 6 },
    });
    expect(applyInput(words, at({ word: "w1", offset: 6 }), forwardDelete)).toEqual({
      edit: { kind: "merge", word: "w1" },
      caret: { word: "w1", offset: 6 },
    });
  });

  it("at the end of the last Word does nothing", () => {
    expect(applyInput(words, at({ word: "w3", offset: 5 }), forwardDelete)).toBeNull();
  });

  it("by whole Word removes the text after the caret, or acts like delete at the end", () => {
    expect(applyInput(words, at({ word: "w1", offset: 3 }), wordForwardDelete)).toEqual({
      edit: { kind: "correct", word: "w1", text: "Hel" },
      caret: { word: "w1", offset: 3 },
    });
    expect(applyInput(words, at({ word: "w1", offset: 6 }), wordForwardDelete)).toEqual({
      edit: { kind: "merge", word: "w1" },
      caret: { word: "w1", offset: 6 },
    });
  });
});

describe("enter", () => {
  it("sets a line break after the Word, then a paragraph break, and opens a slot after it", () => {
    expect(applyInput(words, at({ word: "w1", offset: 6 }), enter)).toEqual({
      edit: { kind: "setBreak", word: "w1", breakAfter: "line" },
      caret: { slotAfter: "w1" },
    });
    expect(applyInput([word("w1", "a", "line")], at({ word: "w1", offset: 1 }), enter)).toEqual({
      edit: { kind: "setBreak", word: "w1", breakAfter: "paragraph" },
      caret: { slotAfter: "w1" },
    });
  });

  it("inside a Word splits it and breaks after the first part", () => {
    expect(applyInput(words, at({ word: "w1", offset: 3 }), enter)).toEqual({
      edit: {
        kind: "batch",
        edits: [
          { kind: "split", word: "w1", at: 3 },
          { kind: "setBreak", word: "w1", breakAfter: "line" },
        ],
      },
      caret: { wordAfter: "w1", offset: 0 },
    });
  });

  it("at the start of a Word breaks after the Word before it", () => {
    expect(applyInput(words, at({ word: "w2", offset: 0 }), enter)).toEqual({
      edit: { kind: "setBreak", word: "w1", breakAfter: "line" },
      caret: { slotAfter: "w1" },
    });
  });

  it("after a paragraph break only moves to the slot", () => {
    expect(applyInput(words, at({ word: "w2", offset: 6 }), enter)).toEqual({
      caret: { slotAfter: "w2" },
    });
  });

  it("in a slot breaks after the slot's Word", () => {
    expect(applyInput(words, at({ slotAfter: "w3" }), enter)).toEqual({
      edit: { kind: "setBreak", word: "w3", breakAfter: "line" },
      caret: { slotAfter: "w3" },
    });
    expect(applyInput([], at({ slotAfter: null }), enter)).toBeNull();
  });
});

describe("resolveCaret", () => {
  it("keeps a caret that names a Word still in the Script, clamped to its text", () => {
    expect(resolveCaret({ word: "w1", offset: 9 }, words)).toEqual({ word: "w1", offset: 6 });
  });

  it("finds the Word after a named one", () => {
    expect(resolveCaret({ wordAfter: "w1", offset: 1 }, words)).toEqual({ word: "w2", offset: 1 });
    expect(resolveCaret({ wordAfter: null, offset: 0 }, words)).toEqual({ word: "w1", offset: 0 });
  });

  it("falls back to the slot at the end when the Word is gone", () => {
    expect(resolveCaret({ word: "gone", offset: 0 }, words)).toEqual({ slotAfter: "w3" });
    expect(resolveCaret({ wordAfter: "w3", offset: 0 }, words)).toEqual({ slotAfter: "w3" });
    expect(resolveCaret({ wordAfter: null, offset: 0 }, [])).toEqual({ slotAfter: null });
  });
});
