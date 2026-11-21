import { describe, expect, it } from "vitest";
import { fieldEdit, nudgeOf, offsetEdit, retimeEdit } from "./timing-controls";
import { scriptWord } from "./test-words";

const word = scriptWord("w1", "Hello", { gap: 100, duration: 300 });
const key = (code: string, modifiers: { shiftKey?: boolean; altKey?: boolean } = {}) => ({
  code,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

describe("nudgeOf", () => {
  it("nudges the Gap by 10 ms, earlier on [ and later on ]", () => {
    expect(nudgeOf(key("BracketLeft"), "w1")).toEqual({ run: "gap:w1", edit: { kind: "move", word: "w1", by: -10 } });
    expect(nudgeOf(key("BracketRight"), "w1")?.edit).toEqual({ kind: "move", word: "w1", by: 10 });
  });

  it("nudges by 100 ms with Shift", () => {
    expect(nudgeOf(key("BracketRight", { shiftKey: true }), "w1")?.edit).toEqual({
      kind: "move",
      word: "w1",
      by: 100,
    });
  });

  it("nudges the duration with Alt", () => {
    expect(nudgeOf(key("BracketLeft", { altKey: true }), "w1")).toEqual({
      run: "duration:w1",
      edit: { kind: "trimEnd", word: "w1", by: -10 },
    });
  });

  it("ignores other keys", () => {
    expect(nudgeOf(key("KeyA"), "w1")).toBeNull();
  });
});

describe("fieldEdit", () => {
  it("Moves by the change in the Gap", () => {
    expect(fieldEdit("gap", word, "250")).toEqual({ kind: "move", word: "w1", by: 150 });
  });

  it("trims the end by the change in the duration", () => {
    expect(fieldEdit("duration", word, "200")).toEqual({ kind: "trimEnd", word: "w1", by: -100 });
  });

  it("changes nothing for an unchanged or unreadable value", () => {
    expect(fieldEdit("gap", word, "100")).toBeNull();
    expect(fieldEdit("gap", word, "soon")).toBeNull();
    expect(fieldEdit("gap", word, "")).toBeNull();
  });
});

describe("offsetEdit", () => {
  it("sets a signed offset", () => {
    expect(offsetEdit("e1", "-120")).toEqual({ kind: "setOffset", event: "e1", offset: -120 });
  });

  it("rejects text that is not whole milliseconds", () => {
    expect(offsetEdit("e1", "1.5")).toBeNull();
  });
});

describe("retimeEdit", () => {
  it("retimes the selected Words by a percentage", () => {
    expect(retimeEdit(["w1", "w2"], "120")).toEqual({ kind: "retime", words: ["w1", "w2"], percent: 120 });
  });

  it("needs Words and a percentage above zero", () => {
    expect(retimeEdit([], "120")).toBeNull();
    expect(retimeEdit(["w1"], "0")).toBeNull();
    expect(retimeEdit(["w1"], "x")).toBeNull();
  });
});
