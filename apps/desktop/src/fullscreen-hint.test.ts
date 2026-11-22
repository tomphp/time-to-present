import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fullscreenHint, type HintState } from "./fullscreen-hint";

describe("fullscreenHint", () => {
  let states: HintState[];
  let changed: (fullscreen: boolean) => void;
  const latest = () => states.at(-1);

  beforeEach(() => {
    vi.useFakeTimers();
    states = [];
    changed = fullscreenHint((state) => states.push(state));
  });
  afterEach(() => vi.useRealTimers());

  it("shows when going Fullscreen", () => {
    changed(true);
    expect(latest()).toBe("shown");
  });

  it("fades after the timeout, then hides once faded", () => {
    changed(true);
    vi.advanceTimersByTime(2999);
    expect(latest()).toBe("shown");
    vi.advanceTimersByTime(1);
    expect(latest()).toBe("fading");
    vi.advanceTimersByTime(1000);
    expect(latest()).toBe("hidden");
  });

  it("restarts when going Fullscreen again", () => {
    changed(true);
    vi.advanceTimersByTime(2500);
    changed(true);
    vi.advanceTimersByTime(2500);
    expect(latest()).toBe("shown");
    vi.advanceTimersByTime(500);
    expect(latest()).toBe("fading");
  });

  it("hides at once when going Windowed, and stays hidden", () => {
    changed(true);
    changed(false);
    expect(latest()).toBe("hidden");
    states.length = 0;
    vi.advanceTimersByTime(10_000);
    expect(states).toEqual([]);
  });
});
