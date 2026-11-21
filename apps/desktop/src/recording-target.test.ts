import { describe, expect, it } from "vitest";
import { collapsed } from "./caret";
import { recordingTargetAt } from "./recording-target";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,"), scriptWord("w2", "world."), scriptWord("w3", "Typed")];

describe("recordingTargetAt with no Words selected", () => {
  it("is before the Word after a slot", () => {
    expect(recordingTargetAt(words, collapsed({ slotAfter: "w1" }))).toEqual({ insertAt: { before: "w2" } });
    expect(recordingTargetAt(words, collapsed({ slotAfter: null }))).toEqual({ insertAt: { before: "w1" } });
  });

  it("is the end of the Script after the last Word or with no caret", () => {
    expect(recordingTargetAt(words, collapsed({ slotAfter: "w3" }))).toEqual({ insertAt: { before: null } });
    expect(recordingTargetAt(words, null)).toEqual({ insertAt: { before: null } });
  });

  it("is before a Word the caret starts, and after one it is inside or ends", () => {
    expect(recordingTargetAt(words, collapsed({ word: "w2", offset: 0 }))).toEqual({ insertAt: { before: "w2" } });
    expect(recordingTargetAt(words, collapsed({ word: "w2", offset: 3 }))).toEqual({ insertAt: { before: "w3" } });
    expect(recordingTargetAt(words, collapsed({ word: "w3", offset: 5 }))).toEqual({ insertAt: { before: null } });
  });
});

describe("recordingTargetAt with Words selected", () => {
  it("Re-records the Words the selection covers any part of", () => {
    const range = { start: { word: "w1", offset: 2 }, end: { word: "w2", offset: 6 } };

    expect(recordingTargetAt(words, range)).toEqual({ reRecord: ["w1", "w2"] });
  });

  it("inserts at the start of a selection that covers no Word", () => {
    const range = { start: { word: "w1", offset: 6 }, end: { word: "w2", offset: 0 } };

    expect(recordingTargetAt(words, range)).toEqual({ insertAt: { before: "w2" } });
  });
});
