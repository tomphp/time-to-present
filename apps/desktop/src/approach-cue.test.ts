import { describe, expect, it } from "vitest";
import { approachCue, longGapFromSeconds, type ApproachCueSettings } from "./approach-cue";
import { eventsUpTo, rehearsal } from "./recorded-rehearsal";
import { followClock, scriptTimeAt, UNFOLLOWED } from "./teleprompter-view";
import { scriptWord } from "./test-words";

const ON: ApproachCueSettings = { enabled: true, longGap: 1_500 };
const { words } = rehearsal.state;

const cueOfRehearsal = (at: number, settings = ON) => {
  const followed = eventsUpTo(at).reduce((state, entry) => followClock(state, entry.event, entry.at), UNFOLLOWED);
  return approachCue(words, followed, scriptTimeAt(followed, at), settings);
};

describe("the Approach Cue", () => {
  it("fills the next Word's underline through the Gap, driven by the extrapolated clock", () => {
    expect(cueOfRehearsal(3_200)).toEqual({ word: 3, fill: 0.5, countdown: null });
    expect(cueOfRehearsal(3_210)).toEqual({ word: 3, fill: 310 / 600, countdown: null });
  });

  it("fills through the Lead-in toward the first Word", () => {
    expect(cueOfRehearsal(250)).toEqual({ word: 0, fill: 0.5, countdown: null });
  });

  it("holds its fill while paused", () => {
    expect(cueOfRehearsal(2_600)).toEqual({ word: 3, fill: 100 / 600, countdown: null });
  });

  it("shows nothing while a Word is being spoken, before play, once ended or when switched off", () => {
    expect(cueOfRehearsal(600)).toBeNull();
    expect(approachCue(words, { state: "ready", speed: 1 }, 0, ON)).toBeNull();
    expect(cueOfRehearsal(5_500)).toBeNull();
    expect(cueOfRehearsal(3_200, { ...ON, enabled: false })).toBeNull();
  });

  it("shows no fill for a Gap under 100 ms, and fills one of exactly 100 ms", () => {
    const short = [scriptWord("w1", "a", { start: 0 }), scriptWord("w2", "b", { start: 399, gap: 99 })];
    const just = [scriptWord("w1", "a", { start: 0 }), scriptWord("w2", "b", { start: 400, gap: 100 })];
    const playing = { state: "playing", speed: 1 } as const;

    expect(approachCue(short, playing, 350, ON)).toBeNull();
    expect(approachCue(just, playing, 350, ON)).toEqual({ word: 1, fill: 0.5, countdown: null });
  });

  it("counts down the whole seconds left on a Long Gap, at the current speed", () => {
    const long = [scriptWord("w1", "a", { start: 0 }), scriptWord("w2", "b", { start: 3_300, gap: 3_000 })];

    expect(approachCue(long, { state: "playing", speed: 1 }, 800, ON)).toEqual({ word: 1, fill: 500 / 3_000, countdown: 3 });
    expect(approachCue(long, { state: "playing", speed: 1 }, 2_300, ON)?.countdown).toBe(1);
    expect(approachCue(long, { state: "playing", speed: 2 }, 800, ON)?.countdown).toBe(2);
  });

  it("treats a Gap at the threshold as Long, using the presenter's threshold", () => {
    expect(cueOfRehearsal(3_200, { enabled: true, longGap: 600 })?.countdown).toBe(1);
    expect(cueOfRehearsal(3_200, { enabled: true, longGap: 601 })?.countdown).toBeNull();
  });
});

describe("the Long Gap threshold in Settings", () => {
  it("is entered in seconds and kept in milliseconds", () => {
    expect(longGapFromSeconds("1.5")).toBe(1_500);
    expect(longGapFromSeconds("2")).toBe(2_000);
  });

  it("refuses anything that is not between a tenth of a second and an hour", () => {
    for (const text of ["", "abc", "0", "-1", "0.05", "3601", "1e999", "Infinity"]) {
      expect(longGapFromSeconds(text)).toBeNull();
    }
    expect(longGapFromSeconds("0.1")).toBe(100);
  });
});
