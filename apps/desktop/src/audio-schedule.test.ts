import { describe, expect, it } from "vitest";
import { audioRuns, audioSchedule, pieceTiming, listenClip, listenTarget, type AudioRun, type Clip, type Piece } from "./audio-schedule";
import type { ScriptWord } from "./session";
import { scriptWord } from "./test-words";

const spoken = (id: string, start: number, duration: number, audioStart: number, audioEnd: number, recordingId = "r1") =>
  scriptWord(id, id, { start, duration, recordingId, audioStart, audioEnd });

/** Three Words as recorded, with a Lead-in and Gaps: Script Time runs alongside Recording Time. */
const passage = [
  spoken("w1", 400, 300, 1_200, 1_500),
  spoken("w2", 850, 450, 1_650, 2_100),
  spoken("w3", 1_500, 300, 2_300, 2_600),
];
const PASSAGE_END = 1_800;

const overlapping = [spoken("w1", 0, 500, 1_000, 1_500), spoken("w2", 500, 500, 1_300, 1_800)];

const test1Ending = [
  spoken("minutes", 57_000, 1_028, 59_140, 60_200),
  spoken("to", 58_028, 1_145, 59_400, 60_580),
  spoken("make.", 59_173, 1_746, 59_680, 61_480),
];
const TEST1_END = 60_919;

/** Six Words of 600 ms with 100 ms Gaps: one Run too long for one piece. */
const longPassage = Array.from({ length: 6 }, (_, index) => spoken(`w${index + 1}`, index * 700, 600, index * 700, index * 700 + 600));

const run = (start: number, from: number, until: number, recording = "r1"): AudioRun => ({ recording, start, from, until });
const piece = (key: string, at: number, from: number, until: number): Piece => ({ key, recording: "r1", at, from, until });
const at = (scriptTime: number, speed = 1) => ({ scriptTime, speed });

const soundedTwice = (pieces: Clip[]) =>
  pieces.some((piece, index) =>
    pieces.slice(index + 1).some((other) => other.recording === piece.recording && other.from < piece.until && piece.from < other.until),
  );

const edit = (words: ScriptWord[], changes: Record<string, Partial<ScriptWord>>) =>
  words.map((word) => ({ ...word, ...changes[word.id] }));

describe("audioRuns", () => {
  it("sounds an unedited passage as one Run, through its Gaps, from its first Word's audio to its last's", () => {
    expect(audioRuns(passage, PASSAGE_END)).toEqual([run(400, 1_200, 2_600)]);
  });

  it("makes no seam where Trim start moved a Word's start and its audio together", () => {
    const trimmedIn = edit(passage, { w2: { start: 900, duration: 400, audioStart: 1_700 } });
    const trimmedOut = edit(passage, { w2: { start: 800, duration: 500, audioStart: 1_600 } });

    expect(audioRuns(trimmedIn, PASSAGE_END)).toEqual([run(400, 1_200, 2_600)]);
    expect(audioRuns(trimmedOut, PASSAGE_END)).toEqual([run(400, 1_200, 2_600)]);
  });

  it("makes a seam after a Move", () => {
    const moved = edit(passage, { w2: { start: 950 }, w3: { start: 1_600 } });

    expect(audioRuns(moved, 1_900)).toEqual([run(400, 1_200, 1_500), run(950, 1_650, 2_600)]);
  });

  it("makes a seam after Trim end, cutting the trimmed Word where it was trimmed", () => {
    const trimmed = edit(passage, { w1: { duration: 200, audioEnd: 1_400 }, w2: { start: 750 }, w3: { start: 1_400 } });

    expect(audioRuns(trimmed, 1_700)).toEqual([run(400, 1_200, 1_400), run(750, 1_650, 2_600)]);
  });

  it("makes a seam at every Word of a Retime, each sounding unstretched from its new Script Time", () => {
    const retimed = edit(passage, { w1: { duration: 270 }, w2: { start: 805, duration: 405 }, w3: { start: 1_390, duration: 270 } });

    expect(audioRuns(retimed, 1_660)).toEqual([run(400, 1_200, 1_500), run(805, 1_650, 2_100), run(1_390, 2_300, 2_570)]);
  });

  it("makes a seam where a Word was deleted, and never sounds it", () => {
    const deleted = edit(passage, { w3: { start: 900 } }).filter((word) => word.id !== "w2");

    expect(audioRuns(deleted, 1_200)).toEqual([run(400, 1_200, 1_500), run(900, 2_300, 2_600)]);
  });

  it("ends a Run at a typed Word, even where the audio around it still lines up", () => {
    const typed = [helloWorld[0], scriptWord("t", "Typed", { start: 700, duration: 100 }), ...passage.slice(1)];

    expect(audioRuns(typed, PASSAGE_END)).toEqual([run(400, 1_200, 1_500), run(850, 1_650, 2_600)]);
  });

  it("makes a seam where the Recording changes", () => {
    const reRecorded = edit(passage, { w2: { recordingId: "r2" } });

    expect(audioRuns(reRecorded, PASSAGE_END)).toEqual([run(400, 1_200, 1_500), run(850, 1_650, 2_100, "r2"), run(1_500, 2_300, 2_600)]);
  });

  it("makes a seam at an overlap in older data, cutting the earlier Word where the next one's audio starts", () => {
    expect(audioRuns(overlapping, 1_000)).toEqual([run(0, 1_000, 1_300), run(500, 1_300, 1_800)]);
  });

  it("sounds each of Test1's Retimed, overlapping final three Words once, stopping at Script End", () => {
    expect(audioRuns(test1Ending, TEST1_END)).toEqual([run(57_000, 59_140, 59_400), run(58_028, 59_400, 59_680), run(59_173, 59_680, 61_426)]);
  });

  it("cuts a Run to fit where the next Run starts", () => {
    const squeezed = [spoken("w1", 400, 200, 1_200, 1_500), spoken("w2", 650, 450, 1_650, 2_100)];

    expect(audioRuns(squeezed, 1_100)).toEqual([run(400, 1_200, 1_450), run(650, 1_650, 2_100)]);
  });

  it("cuts the last Run at Script End", () => {
    expect(audioRuns([spoken("w1", 1_000, 300, 0, 800)], 1_300)).toEqual([run(1_000, 0, 300)]);
  });

  it("sounds each Word as its own Run, unstretched and cut to fit, faster than 1×", () => {
    expect(audioRuns(passage, PASSAGE_END, 2)).toEqual([run(400, 1_200, 1_425), run(850, 1_650, 1_975), run(1_500, 2_300, 2_450)]);
  });

  it("lets each Word's Run play to its audio's end, slower than 1×", () => {
    expect(audioRuns(passage, PASSAGE_END, 0.5)).toEqual([run(400, 1_200, 1_500), run(850, 1_650, 2_100), run(1_500, 2_300, 2_600)]);
  });

  it("never sounds an overlap twice at any speed", () => {
    expect(audioRuns(overlapping, 2_000, 0.5)).toEqual([run(0, 1_000, 1_300), run(500, 1_300, 1_800)]);
  });

  it("drops Words with no audio to sound", () => {
    expect(audioRuns([spoken("hi", 0, 0, 500, 500)], 1_000)).toEqual([]);
  });
});

describe("audioSchedule", () => {
  it("sounds a short Run as one piece, keyed by where its Run and piece start", () => {
    expect(audioSchedule(passage, PASSAGE_END, at(0))).toEqual([piece("400:1200", 400, 1_200, 2_600)]);
  });

  it("cuts a long Run at Words' audio into pieces of up to 2 s that sound back to back", () => {
    expect(audioSchedule(longPassage, 4_100, at(0))).toEqual([
      piece("0:0", 0, 0, 1_400),
      piece("0:1400", 1_400, 1_400, 2_800),
      piece("0:2800", 2_800, 2_800, 4_100),
    ]);
  });

  it("makes a Word longer than a piece a piece of its own", () => {
    const long = [spoken("w1", 0, 300, 0, 300), spoken("w2", 400, 2_600, 400, 3_000), spoken("w3", 3_100, 300, 3_100, 3_400)];

    expect(audioSchedule(long, 3_400, at(0))).toEqual([piece("0:0", 0, 0, 400), piece("0:400", 400, 400, 3_100), piece("0:3100", 3_100, 3_100, 3_400)]);
  });

  it("joins a Run where it would be by now, keeping each piece's key", () => {
    expect(audioSchedule(longPassage, 4_100, at(1_500))).toEqual([piece("0:1400", 1_500, 1_500, 2_800), piece("0:2800", 2_800, 2_800, 4_100)]);
  });

  it("joins part way rounded up to a whole ms of Recording Time, so nothing heard sounds again", () => {
    expect(audioSchedule(longPassage, 4_100, at(1_500.4))[0]).toEqual(piece("0:1400", 1_501, 1_501, 2_800));
    expect(audioSchedule(passage, PASSAGE_END, at(401, 3))[0]).toEqual(piece("400:1200", 403, 1_201, 1_350));
  });

  it("joins a Word's Run part way at other speeds by the time the clock has run", () => {
    expect(audioSchedule(passage, PASSAGE_END, at(500, 2))[0]).toEqual(piece("400:1200", 500, 1_250, 1_425));
  });

  it("never sounds again what was heard at the speed before a speed change", () => {
    expect(audioSchedule(passage, PASSAGE_END, at(900, 2), 1)[0]).toEqual(piece("850:1650", 950, 1_700, 1_975));
    expect(audioSchedule(passage, PASSAGE_END, at(900, 1), 2)[0]).toEqual(piece("400:1200", 900, 1_700, 2_600));
  });

  it("starts with the next Run once the clock is past where one ran out", () => {
    expect(audioSchedule(passage, PASSAGE_END, at(860, 2)).map(({ key }) => key)).toEqual(["850:1650", "1500:2300"]);
    expect(audioSchedule(passage, PASSAGE_END, at(1_800))).toEqual([]);
  });

  it("never sounds Test1's Retimed, overlapping final three Words twice", () => {
    expect(soundedTwice(audioSchedule(test1Ending, TEST1_END, at(57_000)))).toBe(false);
  });

  it("never sounds an unedited overlap twice", () => {
    expect(soundedTwice(audioSchedule(overlapping, 1_000, at(0)))).toBe(false);
  });
});

const helloWorld = [...passage.slice(0, 2), scriptWord("w3", "Typed", { start: 1_400, duration: 300 })];

describe("listenClip", () => {
  it("is the Word's own Recording from a second before its audio to a second after", () => {
    expect(listenClip(helloWorld[0])).toEqual({ recording: "r1", from: 200, until: 2_500 });
  });

  it("starts no earlier than the start of the Recording", () => {
    expect(listenClip(spoken("w1", 0, 300, 400, 700))).toEqual({ recording: "r1", from: 0, until: 1_700 });
  });

  it("has nothing to play for a typed Word", () => {
    expect(listenClip(helloWorld[2])).toBeNull();
  });
});

describe("listenTarget", () => {
  it("is the clip of the first selected Word", () => {
    expect(listenTarget(helloWorld, ["w2", "w1"], false)).toEqual(listenClip(helloWorld[1]));
  });

  it("is nothing with no Word selected, or for a typed Word", () => {
    expect(listenTarget(helloWorld, [], false)).toBeNull();
    expect(listenTarget(helloWorld, ["w3"], false)).toBeNull();
  });

  it("is nothing while the editor is locked, where it would sound over a Preview or into the mic", () => {
    expect(listenTarget(helloWorld, ["w1"], true)).toBeNull();
  });
});

describe("pieceTiming", () => {
  const clip = piece("400:1200", 1_400, 1_200, 1_500);
  const anchor = { audioTime: 10, scriptTime: 1_000, speed: 2 };

  it("starts the piece when the clock reaches its Script Time, on the audio clock", () => {
    expect(pieceTiming(clip, anchor, 10)).toEqual({ when: 10.2, offset: 0, duration: 0.3 });
  });

  it("joins a piece that arrives late where it would be by now", () => {
    expect(pieceTiming(clip, anchor, 10.3)).toEqual({ when: 10.3, offset: expect.closeTo(0.1), duration: expect.closeTo(0.2) });
  });

  it("drops a piece that arrives after it would have finished", () => {
    expect(pieceTiming(clip, anchor, 10.5)).toBeNull();
  });
});
