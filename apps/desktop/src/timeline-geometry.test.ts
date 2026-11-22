import { describe, expect, it } from "vitest";
import { scriptWord } from "./test-words";
import { MIN_BLOCK_PX, dragEdit, flagDragEdit, hitTest, msAt, secondTicks, timelineBlocks, waveformBars, xOf } from "./timeline-geometry";

const words = [
  scriptWord("w1", "Hello,", { start: 400, duration: 300 }),
  scriptWord("w2", "world.", { start: 700, duration: 450 }),
  scriptWord("w3", "Typed", { start: 1250, duration: 100 }),
];
const blocks = timelineBlocks(words);

describe("time and x", () => {
  it("lays Script Time out at 200 px a second", () => {
    expect(xOf(1500)).toBe(300);
    expect(msAt(300)).toBe(1500);
  });

  it("places each Word's block at its absolute Script Time, as wide as it lasts", () => {
    expect(blocks).toEqual([
      { id: "w1", left: 80, width: 60 },
      { id: "w2", left: 140, width: 90 },
      { id: "w3", left: 250, width: 20 },
    ]);
  });

  it("marks every whole second up to the Script End", () => {
    expect(secondTicks(2500)).toEqual([0, 1000, 2000]);
    expect(secondTicks(0)).toEqual([0]);
  });
});

describe("minimum Word Block width", () => {
  const mixed = [
    scriptWord("spoken", "Hi", { start: 0, duration: 300, recordingId: "r1", audioStart: 0, audioEnd: 300 }),
    scriptWord("unloaded", "there", { start: 300, duration: 0, recordingId: "r2", audioStart: 0, audioEnd: 0 }),
    scriptWord("brief", "you", { start: 300, duration: 10, recordingId: "r1", audioStart: 300, audioEnd: 310 }),
    scriptWord("typed", "all", { start: 400, duration: 0 }),
  ];
  const widened = timelineBlocks(mixed);

  it("is 6 px", () => {
    expect(MIN_BLOCK_PX).toBe(6);
  });

  it("draws one Block per Word in Script order, never narrower than the minimum", () => {
    expect(widened).toEqual([
      { id: "spoken", left: 0, width: 60 },
      { id: "unloaded", left: 60, width: 6 },
      { id: "brief", left: 60, width: 6 },
      { id: "typed", left: 80, width: 6 },
    ]);
  });

  it("picks a widened Block across its whole width, with a grip a quarter of it at each edge", () => {
    expect(hitTest(widened, 80)).toEqual({ word: "typed", grip: "start" });
    expect(hitTest(widened, 83)).toEqual({ word: "typed", grip: "body" });
    expect(hitTest(widened, 85.9)).toEqual({ word: "typed", grip: "end" });
  });

  it("gives an overlap to the earlier Block", () => {
    expect(hitTest(widened, 63)).toEqual({ word: "unloaded", grip: "body" });
  });
});

describe("hitTest", () => {
  it("grips a block by its body away from its edges", () => {
    expect(hitTest(blocks, 180)).toEqual({ word: "w2", grip: "body" });
  });

  it("grips a block's start or end within 6 px inside its edges", () => {
    expect(hitTest(blocks, 142)).toEqual({ word: "w2", grip: "start" });
    expect(hitTest(blocks, 226)).toEqual({ word: "w2", grip: "end" });
  });

  it("prefers the block under the pointer where two blocks touch", () => {
    expect(hitTest(blocks, 140)).toEqual({ word: "w2", grip: "start" });
    expect(hitTest(blocks, 139)).toEqual({ word: "w1", grip: "end" });
  });

  it("leaves a narrow block a body between edges a quarter of its width", () => {
    expect(hitTest(blocks, 254)).toEqual({ word: "w3", grip: "start" });
    expect(hitTest(blocks, 260)).toEqual({ word: "w3", grip: "body" });
    expect(hitTest(blocks, 266)).toEqual({ word: "w3", grip: "end" });
  });

  it("grips the nearest edge within 6 px outside a block", () => {
    expect(hitTest(blocks, 246)).toEqual({ word: "w3", grip: "start" });
    expect(hitTest(blocks, 233)).toEqual({ word: "w2", grip: "end" });
  });

  it("misses in a Gap away from any edge", () => {
    expect(hitTest(blocks, 50)).toBeNull();
    expect(hitTest(blocks, 300)).toBeNull();
  });
});

describe("dragEdit", () => {
  it("Moves a Word dragged by its body by the whole drag so far", () => {
    expect(dragEdit({ word: "w2", grip: "body" }, 21)).toEqual({ kind: "move", word: "w2", by: 105 });
  });

  it("Trims a Word dragged by an edge", () => {
    expect(dragEdit({ word: "w2", grip: "start" }, -10)).toEqual({ kind: "trimStart", word: "w2", by: -50 });
    expect(dragEdit({ word: "w2", grip: "end" }, 3.3)).toEqual({ kind: "trimEnd", word: "w2", by: 17 });
  });
});

describe("waveformBars", () => {
  const waveform = { bucket: 10, peaks: [0.1, 0.2, 0.9, 0.4, 0.3, 0.8, 0.5, 0.6] };

  it("draws a typed Word with no waveform", () => {
    expect(waveformBars(waveform, scriptWord("w3", "Typed"), 4)).toEqual([]);
  });

  it("draws the Word's own audio unstretched, 5 ms to a column", () => {
    const spoken = scriptWord("w1", "Hi", { recordingId: "r1", audioStart: 20, audioEnd: 60 });

    expect(waveformBars(waveform, spoken, 8)).toEqual([0.9, 0.9, 0.4, 0.4, 0.3, 0.3, 0.8, 0.8]);
  });

  it("cuts the audio at the end of a block shorter than it", () => {
    const spoken = scriptWord("w1", "Hi", { recordingId: "r1", audioStart: 20, audioEnd: 60 });

    expect(waveformBars(waveform, spoken, 3)).toEqual([0.9, 0.9, 0.4]);
  });

  it("draws silence past the Word's audio and past the end of its Recording", () => {
    const longer = scriptWord("w1", "Hi", { recordingId: "r1", audioStart: 20, audioEnd: 30 });
    const pastTheEnd = scriptWord("w1", "Hi", { recordingId: "r1", audioStart: 70, audioEnd: 110 });

    expect(waveformBars(waveform, longer, 4)).toEqual([0.9, 0.9, 0, 0]);
    expect(waveformBars(waveform, pastTheEnd, 4)).toEqual([0.6, 0.6, 0, 0]);
  });
});

describe("flagDragEdit", () => {
  const flag = { id: "e1", time: 800 };

  it("re-anchors to the nearest Word start with the signed offset left over", () => {
    expect(flagDragEdit(words, flag, 10)).toEqual({ kind: "moveEvent", event: "e1", anchor: "w2", offset: 150 });
    expect(flagDragEdit(words, flag, -30)).toEqual({ kind: "moveEvent", event: "e1", anchor: "w2", offset: -50 });
  });

  it("can land on either side of a Word, so a flag just before one anchors to it with a negative offset", () => {
    expect(flagDragEdit(words, flag, 80)).toEqual({ kind: "moveEvent", event: "e1", anchor: "w3", offset: -50 });
  });

  it("picks the earlier Word when two starts are equally near", () => {
    expect(flagDragEdit(words, { id: "e1", time: 975 }, 0)).toMatchObject({ anchor: "w2", offset: 275 });
  });

  it("never drags a flag before the Script start", () => {
    expect(flagDragEdit(words, flag, -1000)).toEqual({ kind: "moveEvent", event: "e1", anchor: "w1", offset: -400 });
  });

  it("anchors to the Script start when there are no Words", () => {
    expect(flagDragEdit([], flag, 10)).toEqual({ kind: "moveEvent", event: "e1", anchor: "scriptStart", offset: 850 });
  });
});
