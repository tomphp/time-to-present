import { describe, expect, it } from "vitest";
import {
  channelOptions,
  escapeAction,
  formatElapsed,
  inputOptions,
  meterFill,
  shortcut,
} from "./recording-bar-view";
import type { RecordingBarState } from "./session";

const builtIn = { name: "MacBook Pro Microphone", channels: 1, sampleRate: 48000 };
const motu = { name: "MOTU M2", channels: 2, sampleRate: 44100 };

const bar = (device: string | null, recording = false): RecordingBarState => ({
  access: "granted",
  inputs: [builtIn, motu],
  input: { choice: { device, channel: 1 }, device: device === null ? builtIn : motu },
  notice: null,
  recording,
});

describe("formatElapsed", () => {
  it("shows minutes and zero-padded seconds, rounding down", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(5_999)).toBe("0:05");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(720_000)).toBe("12:00");
  });
});

describe("meterFill", () => {
  it("maps the peak onto -60 to 0 dBFS", () => {
    expect(meterFill(1)).toBe(1);
    expect(meterFill(0.001)).toBeCloseTo(0);
    expect(meterFill(0.1)).toBeCloseTo(2 / 3);
  });

  it("stays empty for silence and full past full scale", () => {
    expect(meterFill(0)).toBe(0);
    expect(meterFill(1.5)).toBe(1);
  });
});

describe("shortcut", () => {
  it("toggles recording on ⌘R and cancels on Esc", () => {
    expect(shortcut({ key: "r", metaKey: true })).toBe("toggle");
    expect(shortcut({ key: "R", metaKey: true })).toBe("toggle");
    expect(shortcut({ key: "Escape", metaKey: false })).toBe("escape");
  });

  it("ignores R without ⌘ and other keys", () => {
    expect(shortcut({ key: "r", metaKey: false })).toBeNull();
    expect(shortcut({ key: "s", metaKey: true })).toBeNull();
  });
});

describe("escapeAction", () => {
  it("cancels a recording of under three seconds at once", () => {
    expect(escapeAction(true, 2_999, false)).toBe("cancel");
  });

  it("asks before cancelling a longer recording", () => {
    expect(escapeAction(true, 3_000, false)).toBe("confirm");
  });

  it("keeps recording when Esc is pressed again while asking", () => {
    expect(escapeAction(true, 10_000, true)).toBe("keep");
  });

  it("does nothing when not recording", () => {
    expect(escapeAction(false, 0, false)).toBe("none");
  });
});

describe("inputOptions", () => {
  it("offers the system default first, then every input, marking the chosen one", () => {
    expect(inputOptions(bar("MOTU M2"))).toEqual([
      { value: "", label: "System default", selected: false },
      { value: "MacBook Pro Microphone", label: "MacBook Pro Microphone", selected: false },
      { value: "MOTU M2", label: "MOTU M2", selected: true },
    ]);
  });

  it("marks the system default when no device is chosen", () => {
    expect(inputOptions(bar(null))[0]).toEqual({ value: "", label: "System default", selected: true });
  });
});

describe("channelOptions", () => {
  it("numbers the active input's channels from 1", () => {
    expect(channelOptions(bar("MOTU M2"))).toEqual([1, 2]);
  });

  it("has none without an active input", () => {
    expect(channelOptions({ ...bar(null), input: null })).toEqual([]);
  });
});
