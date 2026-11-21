import { describe, expect, it } from "vitest";
import { clockAction, DISCONNECTED, foldClock, type ClockPanel } from "./clock-view";
import type { Snapshot, StreamEvent } from "./session";

const snapshot = (overrides: Partial<Snapshot> = {}): StreamEvent => ({
  type: "snapshot",
  protocolVersion: 1,
  scriptVersion: 1,
  clock: { state: "paused", scriptTime: 1_400, speed: 1.5 },
  currentWord: { id: "w3", text: "Typed", start: 1_400, duration: 300 },
  passedEvents: [],
  ...overrides,
});

const fold = (...events: StreamEvent[]) => events.reduce(foldClock, DISCONNECTED);

describe("foldClock", () => {
  it("starts from nothing until the first Snapshot", () => {
    expect(DISCONNECTED).toEqual<ClockPanel>({ state: null, scriptTime: 0, speed: 1, currentWord: null });
  });

  it("takes everything from a Snapshot", () => {
    expect(fold(snapshot())).toEqual<ClockPanel>({
      state: "paused",
      scriptTime: 1_400,
      speed: 1.5,
      currentWord: "Typed",
    });
    expect(fold(snapshot({ currentWord: null })).currentWord).toBeNull();
  });

  it("follows clock changes and ticks, and forgets the Word on reset", () => {
    const playing = fold(snapshot(), { type: "clock", state: "playing", scriptTime: 1_400, speed: 1.5, cause: "play" });
    expect(playing.state).toBe("playing");
    expect(foldClock(playing, { type: "tick", scriptTime: 1_550 }).scriptTime).toBe(1_550);
    const reset = foldClock(playing, { type: "clock", state: "ready", scriptTime: 0, speed: 1.5, cause: "reset" });
    expect(reset).toEqual<ClockPanel>({ state: "ready", scriptTime: 0, speed: 1.5, currentWord: null });
  });

  it("shows each Word as it starts and ignores Named Events", () => {
    const panel = fold(
      snapshot(),
      { type: "word", id: "w4", text: "next", start: 1_800, duration: 200 },
      { type: "namedEvent", id: "e9", name: "slide", data: null, scriptTime: 1_900 },
    );
    expect(panel.currentWord).toBe("next");
  });

  it("goes back to nothing when the stream closes", () => {
    expect(fold(snapshot(), { type: "closed", reason: "closed" })).toEqual(DISCONNECTED);
  });
});

describe("clockAction", () => {
  it("plays from ready or paused, pauses while playing, restarts from ended, and waits for a Snapshot", () => {
    expect(clockAction("ready")).toBe("play");
    expect(clockAction("paused")).toBe("play");
    expect(clockAction("playing")).toBe("pause");
    expect(clockAction("ended")).toBe("reset");
    expect(clockAction(null)).toBeNull();
  });
});
