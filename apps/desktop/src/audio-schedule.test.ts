import { describe, expect, it } from "vitest";
import { audioSchedule, cueTiming, listenClip, type Cue } from "./audio-schedule";
import { scriptWord } from "./test-words";

const spoken = (id: string, start: number, duration: number, audioStart: number, audioEnd: number) =>
  scriptWord(id, id, { start, duration, recordingId: "r1", audioStart, audioEnd });

const helloWorld = [
  spoken("w1", 400, 300, 1_200, 1_500),
  spoken("w2", 850, 450, 1_650, 2_100),
  scriptWord("w3", "Typed", { start: 1_400, duration: 300 }),
];
const SCRIPT_END = 2_200;

const at = (scriptTime: number, speed = 1) => ({ scriptTime, speed });

describe("audioSchedule", () => {
  it("plays each spoken Word's clip from its Script Time and stays silent in Gaps and for typed Words", () => {
    expect(audioSchedule(helloWorld, SCRIPT_END, at(0))).toEqual<Cue[]>([
      { word: "w1", recording: "r1", at: 400, from: 1_200, until: 1_500 },
      { word: "w2", recording: "r1", at: 850, from: 1_650, until: 2_100 },
    ]);
  });

  it("cuts a clip at the next Word's start", () => {
    const retimed = [spoken("w1", 400, 200, 1_200, 1_500), spoken("w2", 650, 450, 1_650, 2_100)];

    expect(audioSchedule(retimed, 1_100, at(0))[0]).toEqual<Cue>({ word: "w1", recording: "r1", at: 400, from: 1_200, until: 1_450 });
  });

  it("cuts the last Word's clip at Script End", () => {
    const last = [spoken("w1", 1_000, 300, 0, 800)];

    expect(audioSchedule(last, 1_300, at(0))).toEqual<Cue[]>([{ word: "w1", recording: "r1", at: 1_000, from: 0, until: 300 }]);
  });

  it("joins a clip part way through when the clock is inside its Word", () => {
    expect(audioSchedule(helloWorld, SCRIPT_END, at(500))[0]).toEqual<Cue>({
      word: "w1",
      recording: "r1",
      at: 500,
      from: 1_300,
      until: 1_500,
    });
  });

  it("starts with the next Word once the clock is past where the clip ran out", () => {
    expect(audioSchedule(helloWorld, SCRIPT_END, at(750)).map((cue) => cue.word)).toEqual(["w2"]);
    expect(audioSchedule(helloWorld, SCRIPT_END, at(1_400))).toEqual([]);
  });

  it("plays clips unstretched at any speed, so a faster clock cuts them sooner", () => {
    expect(audioSchedule(helloWorld, SCRIPT_END, at(0, 2))).toEqual<Cue[]>([
      { word: "w1", recording: "r1", at: 400, from: 1_200, until: 1_425 },
      { word: "w2", recording: "r1", at: 850, from: 1_650, until: 1_925 },
    ]);
    expect(audioSchedule(helloWorld, SCRIPT_END, at(500, 2))[0]).toMatchObject({ at: 500, from: 1_250, until: 1_425 });
  });

  it("lets a slower clock play a clip to its end, then stays silent until the next Word", () => {
    expect(audioSchedule(helloWorld, SCRIPT_END, at(0, 0.5))[0]).toMatchObject({ from: 1_200, until: 1_500 });
  });

  it("rounds into whole ms of Recording Time", () => {
    expect(audioSchedule(helloWorld, SCRIPT_END, at(401, 3))[0]).toMatchObject({ from: 1_200, until: 1_350 });
  });
});

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

describe("cueTiming", () => {
  const cue: Cue = { word: "w1", recording: "r1", at: 1_400, from: 1_200, until: 1_500 };
  const anchor = { audioTime: 10, scriptTime: 1_000, speed: 2 };

  it("starts the clip when the clock reaches its Script Time, on the audio clock", () => {
    expect(cueTiming(cue, anchor, 10)).toEqual({ when: 10.2, offset: 0, duration: 0.3 });
  });

  it("joins a clip that arrives late where it would be by now", () => {
    expect(cueTiming(cue, anchor, 10.3)).toEqual({ when: 10.3, offset: expect.closeTo(0.1), duration: expect.closeTo(0.2) });
  });

  it("drops a clip that arrives after it would have finished", () => {
    expect(cueTiming(cue, anchor, 10.5)).toBeNull();
  });
});
