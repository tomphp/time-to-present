import { describe, expect, it } from "vitest";
import {
  clockIcon,
  connectionSummary,
  endedSummary,
  eventTicks,
  focusLost,
  foldRun,
  NOT_STARTED,
  playNeedsConfirmation,
  progress,
  remaining,
  speedChanged,
  speedLabel,
} from "./performance-bar";
import type { StreamEvent } from "./session";

const clock = (cause: "play" | "pause" | "end" | "reset"): StreamEvent => ({
  type: "clock",
  cause,
  state: cause === "end" ? "ended" : "playing",
  scriptTime: 0,
  speed: 1,
});

describe("remaining time", () => {
  it("is what is left of the Script at the current speed", () => {
    expect(remaining(10_000, 70_000, 1)).toBe("−1:00");
    expect(remaining(10_000, 70_000, 2)).toBe("−0:30");
    expect(remaining(80_000, 70_000, 1)).toBe("−0:00");
  });
});

describe("progress", () => {
  it("is the fraction of the Script played, clamped", () => {
    expect(progress(25_000, 100_000)).toBe(0.25);
    expect(progress(200_000, 100_000)).toBe(1);
    expect(progress(5, 0)).toBe(0);
  });

  it("places Named Event ticks along the Script", () => {
    expect(eventTicks([{ time: 0 }, { time: 50_000 }], 100_000)).toEqual([0, 0.5]);
  });
});

describe("speed", () => {
  it("is labelled and highlighted only when not 1.0×", () => {
    expect(speedLabel(1)).toBe("1.0×");
    expect(speedLabel(1.05)).toBe("1.05×");
    expect(speedChanged(1)).toBe(false);
    expect(speedChanged(0.95)).toBe(true);
  });
});

describe("the connection cue", () => {
  it("asks for a second press only on the first play from ready with no app connected", () => {
    expect(playNeedsConfirmation("ready", 0, false)).toBe(true);
    expect(playNeedsConfirmation("ready", 0, true)).toBe(false);
    expect(playNeedsConfirmation("ready", 1, false)).toBe(false);
    expect(playNeedsConfirmation("paused", 0, false)).toBe(false);
  });

  it("counts connected apps", () => {
    expect(connectionSummary({ url: "http://localhost:4747", connectedApps: 1 }).apps).toBe("1 app connected");
    expect(connectionSummary({ url: "http://localhost:4747", connectedApps: 0 }).apps).toBe("0 apps connected");
  });

  it("warns about lost focus only while playing", () => {
    expect(focusLost("playing", false)).toBe(true);
    expect(focusLost("paused", false)).toBe(false);
    expect(focusLost("playing", true)).toBe(false);
  });
});

describe("the end of the Performance", () => {
  it("shows the wall-clock total including pauses against the Script duration", () => {
    let run = foldRun(NOT_STARTED, clock("play"), 1_000);
    run = foldRun(run, clock("pause"), 100_000);
    run = foldRun(run, clock("play"), 300_000);
    run = foldRun(run, clock("end"), 1_000 + 761_000);
    expect(endedSummary(run, 725_000)).toBe("Ended · 12:41 (Script 12:05)");
  });

  it("is not started by a speed change before play, nor given a total when joined after the end", () => {
    expect(foldRun(NOT_STARTED, { type: "clock", cause: "speed", state: "ready", scriptTime: 0, speed: 1.1 }, 5)).toEqual(NOT_STARTED);
    const joined = foldRun(NOT_STARTED, { type: "snapshot", clock: { state: "ended", scriptTime: 0, speed: 1 } } as StreamEvent, 5);
    expect(endedSummary(joined, 725_000)).toBe("Ended (Script 12:05)");
  });

  it("starts over on reset", () => {
    expect(foldRun(foldRun(NOT_STARTED, clock("play"), 5), clock("reset"), 9)).toEqual(NOT_STARTED);
  });

  it("has a clock icon per state", () => {
    expect(clockIcon("playing")).not.toBe(clockIcon("paused"));
    expect(clockIcon(null)).toBe("");
  });
});
