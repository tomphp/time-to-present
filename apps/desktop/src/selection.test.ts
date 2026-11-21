import { describe, expect, it, vi } from "vitest";
import {
  clickSelection,
  rangeOfSelection,
  sameSelection,
  selectedIds,
  selectionOfRange,
  sharedSelection,
} from "./selection";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,"), scriptWord("w2", "big"), scriptWord("w3", "world.")];

describe("the shared selection", () => {
  it("selects the Words from its anchor to its focus, in Script order either way", () => {
    expect(selectedIds(words, { anchor: "w3", focus: "w2" })).toEqual(["w2", "w3"]);
    expect(selectedIds(words, null)).toEqual([]);
  });

  it("selects nothing once a Word it names has gone", () => {
    expect(selectedIds(words, { anchor: "w1", focus: "w9" })).toEqual([]);
  });

  it("is the same selection whichever way round it was made", () => {
    expect(sameSelection(words, { anchor: "w3", focus: "w1" }, { anchor: "w1", focus: "w3" })).toBe(true);
    expect(sameSelection(words, { anchor: "w1", focus: "w1" }, null)).toBe(false);
  });
});

describe("clicking a block on the timeline", () => {
  it("selects just that Word", () => {
    expect(clickSelection({ anchor: "w1", focus: "w2" }, "w3", false)).toEqual({ anchor: "w3", focus: "w3" });
  });

  it("with Shift extends the selection from its anchor", () => {
    expect(clickSelection({ anchor: "w1", focus: "w1" }, "w3", true)).toEqual({ anchor: "w1", focus: "w3" });
    expect(clickSelection(null, "w2", true)).toEqual({ anchor: "w2", focus: "w2" });
  });
});

describe("from the text pane", () => {
  it("a caret in a Word selects that Word", () => {
    const caret = { word: "w2", offset: 1 };
    expect(selectionOfRange(words, { start: caret, end: caret })).toEqual({ anchor: "w2", focus: "w2" });
  });

  it("a caret in a slot selects nothing", () => {
    const slot = { slotAfter: "w1" };
    expect(selectionOfRange(words, { start: slot, end: slot })).toBeNull();
  });

  it("a range selects every Word it covers any of", () => {
    const range = { start: { word: "w1", offset: 3 }, end: { word: "w2", offset: 1 } };
    expect(selectionOfRange(words, range)).toEqual({ anchor: "w1", focus: "w2" });
  });

  it("a range that only touches a Word's edge leaves it out", () => {
    const range = { start: { word: "w1", offset: 6 }, end: { word: "w3", offset: 0 } };
    expect(selectionOfRange(words, range)).toEqual({ anchor: "w2", focus: "w2" });
  });

  it("a range over only the space between Words selects nothing", () => {
    const range = { start: { word: "w1", offset: 6 }, end: { word: "w2", offset: 0 } };
    expect(selectionOfRange(words, range)).toBeNull();
  });
});

describe("into the text pane", () => {
  it("covers the selected Words from the start of the first to the end of the last", () => {
    expect(rangeOfSelection(words, { anchor: "w3", focus: "w2" })).toEqual({
      start: { word: "w2", offset: 0 },
      end: { word: "w3", offset: 6 },
    });
    expect(rangeOfSelection(words, null)).toBeNull();
  });
});

describe("sharedSelection", () => {
  function shared() {
    const show = vi.fn();
    const selection = sharedSelection(show);
    selection.update(words);
    return { show, selection };
  }

  it("shows a selection made in the text pane on the timeline", () => {
    const { show, selection } = shared();

    selection.fromText({ start: { word: "w1", offset: 2 }, end: { word: "w2", offset: 1 } });

    expect(show).toHaveBeenCalledWith(["w1", "w2"]);
    expect(selection.ids()).toEqual(["w1", "w2"]);
  });

  it("turns a click on the timeline into the range to select in the text pane", () => {
    const { show, selection } = shared();

    expect(selection.fromTimeline("w2", false)).toEqual({
      start: { word: "w2", offset: 0 },
      end: { word: "w2", offset: 3 },
    });
    expect(show).toHaveBeenCalledWith(["w2"]);
  });

  it("keeps its anchor through the text pane echoing a timeline selection back", () => {
    const { show, selection } = shared();
    const range = selection.fromTimeline("w3", false)!;
    selection.fromText(range);
    const extended = selection.fromTimeline("w1", true)!;
    selection.fromText(extended);

    expect(selection.fromTimeline("w2", true)).toEqual({
      start: { word: "w2", offset: 0 },
      end: { word: "w3", offset: 6 },
    });
    expect(show).toHaveBeenCalledTimes(3);
  });

  it("drops Words that edits have removed", () => {
    const { selection } = shared();
    selection.fromTimeline("w2", false);

    selection.update([words[0], words[2]]);

    expect(selection.ids()).toEqual([]);
  });

  it("stays empty when an undo brings back the Words a cut removed", () => {
    const { selection } = shared();
    selection.fromTimeline("w2", false);
    selection.update([words[0], words[2]]);

    selection.update(words);

    expect(selection.ids()).toEqual([]);
  });
});
