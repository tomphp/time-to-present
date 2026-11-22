import { describe, expect, it } from "vitest";
import {
  barNotice,
  canStart,
  channelOptions,
  escapeAction,
  formatElapsed,
  inputOptions,
  liveModelNotice,
  meterFill,
  isCancelKey,
  recordingCommands,
} from "./recording-bar-view";
import type { RecordingTarget } from "./recording-target";
import type { RecordingBarState } from "./session";

const builtIn = { name: "MacBook Pro Microphone", channels: 1, sampleRate: 48000 };
const motu = { name: "MOTU M2", channels: 2, sampleRate: 44100 };

const bar = (device: string | null, recording = false): RecordingBarState => ({
  access: "granted",
  inputs: [builtIn, motu],
  input: { choice: { device, channel: 1 }, device: device === null ? builtIn : motu },
  notice: null,
  recording,
  liveModel: { kind: "ready" },
});

describe("the live model", () => {
  it("must be fetched before a Recording can start", () => {
    expect(canStart(bar(null))).toBe(true);
    expect(canStart({ ...bar(null), liveModel: { kind: "fetching", percent: 40 } })).toBe(false);
    expect(canStart(bar(null, true))).toBe(false);
    expect(canStart({ ...bar(null), input: null })).toBe(false);
  });

  it("does not stop a Recording when it could not be fetched", () => {
    expect(canStart({ ...bar(null), liveModel: { kind: "failed", reason: "offline" } })).toBe(true);
  });

  it("shows its download progress, or why there will be no Live Transcript", () => {
    expect(liveModelNotice({ kind: "ready" })).toBeNull();
    expect(liveModelNotice({ kind: "fetching", percent: null })).toBe("Fetching the live speech model…");
    expect(liveModelNotice({ kind: "fetching", percent: 40 })).toBe("Fetching the live speech model… 40%");
    expect(liveModelNotice({ kind: "failed", reason: "offline" })).toBe("No Live Transcript: offline");
  });

  it("joins its notice to the bar's own", () => {
    const fetching = { ...bar(null), notice: "MOTU M2 is not connected.", liveModel: { kind: "fetching", percent: 5 } } as const;
    expect(barNotice(fetching)).toBe("MOTU M2 is not connected. Fetching the live speech model… 5%");
    expect(barNotice(bar(null))).toBeNull();
  });
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

describe("the Recording Bar's keys", () => {
  const press = (key: string, metaKey: boolean) => isCancelKey({ key, metaKey } as KeyboardEvent);

  it("cancels on Esc", () => {
    expect(press("Escape", false)).toBe(true);
  });

  it("leaves ⌘R to the menu bar's accelerator, so a Recording toggles once", () => {
    expect(press("r", true)).toBe(false);
    expect(press("R", true)).toBe(false);
  });

  it("ignores other keys", () => {
    expect(press("r", false)).toBe(false);
    expect(press("s", true)).toBe(false);
  });
});

describe("Record / Stop and Re-record Selection", () => {
  const selection: RecordingTarget = { reRecord: ["w1", "w2"] };

  function recorder(shown: RecordingBarState | null) {
    const calls: unknown[][] = [];
    const commands = {
      openRecordingBar: async () => void calls.push(["open"]),
      startRecordingAt: async (target: RecordingTarget) => void calls.push(["start", target]),
      stopRecording: async () => void calls.push(["stop"]),
    };
    return { calls, ...recordingCommands(() => shown, () => selection, commands) };
  }

  it("opens the Recording Bar and starts on the target when it is closed", async () => {
    const { calls, toggle } = recorder(null);
    await toggle();

    expect(calls).toEqual([["open"], ["start", selection]]);
  });

  it("starts on the target when the bar is open, and stops a Recording under way", async () => {
    const idle = recorder(bar(null));
    await idle.toggle();
    const running = recorder(bar(null, true));
    await running.toggle();

    expect(idle.calls).toEqual([["start", selection]]);
    expect(running.calls).toEqual([["stop"]]);
  });

  it("Re-records the selection, but never stops a Recording under way", async () => {
    const closed = recorder(null);
    await closed.startUnlessRecording();
    const running = recorder(bar(null, true));
    await running.startUnlessRecording();

    expect(closed.calls).toEqual([["open"], ["start", selection]]);
    expect(running.calls).toEqual([]);
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
