import { describe, expect, it } from "vitest";
import { clockAction, clockPosition, DISCONNECTED, foldClock, previewFrom, type ClockPanel } from "./clock-view";
import type { Snapshot, StreamEvent } from "./session";
import { scriptWord } from "./test-words";

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
      currentWord: { id: "w3", text: "Typed" },
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
    expect(panel.currentWord).toEqual({ id: "w4", text: "next" });
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

describe("clockPosition", () => {
  const playing: ClockPanel = { state: "playing", scriptTime: 1_000, speed: 1.5, currentWord: null };

  it("runs on from the last report at the clock's speed while playing, up to Script End", () => {
    expect(clockPosition(playing, 200, 5_000)).toBe(1_300);
    expect(clockPosition(playing, 10_000, 5_000)).toBe(5_000);
  });

  it("stays where the clock was reported when it isn't playing", () => {
    expect(clockPosition({ ...playing, state: "paused" }, 200, 5_000)).toBe(1_000);
  });
});

describe("previewFrom", () => {
  const words = [scriptWord("w1", "Hello,", { start: 400 }), scriptWord("w2", "world.", { start: 850 })];

  it("starts at the first selected Word", () => {
    expect(previewFrom(words, ["w2"], { before: "w1" })).toBe(850);
  });

  it("starts at the Word after the caret when nothing is selected", () => {
    expect(previewFrom(words, [], { before: "w2" })).toBe(850);
  });

  it("starts at the start when the caret is at the end of the Script", () => {
    expect(previewFrom(words, [], { before: null })).toBe(0);
  });
});
