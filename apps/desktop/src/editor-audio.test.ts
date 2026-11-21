import { describe, expect, it, vi } from "vitest";
import type { Clip } from "./audio-schedule";
import { DISCONNECTED, foldClock, type ClockPanel } from "./clock-view";
import { editorAudio, type AudioOutput } from "./editor-audio";
import type { StreamEvent } from "./session";
import { scriptWord } from "./test-words";

const spoken = (id: string, start: number, audioStart: number) =>
  scriptWord(id, id, { start, duration: 300, recordingId: "r1", audioStart, audioEnd: audioStart + 300 });

const words = [spoken("w1", 400, 1_200), spoken("w2", 1_000, 1_600), spoken("w3", 3_000, 2_000)];
const SCRIPT_END = 3_300;

interface Played {
  clip: Clip;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

function harness() {
  let wallMs = 0;
  const played: Played[] = [];
  const fetched: Clip[] = [];
  const output = { currentTime: 0, destination: {}, resume: vi.fn(async () => {}) } as unknown as AudioOutput & {
    currentTime: number;
  };
  output.decodeAudioData = vi.fn(async (data: ArrayBuffer) => data as unknown as AudioBuffer);
  output.createBufferSource = () => {
    const node = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null as unknown };
    Object.defineProperty(node, "buffer", {
      set: (clip: Clip) => played.push({ clip, start: node.start, stop: node.stop }),
    });
    return node as unknown as AudioBufferSourceNode;
  };
  const fetchClip = vi.fn(async (clip: Clip) => {
    fetched.push(clip);
    return clip as unknown as ArrayBuffer;
  });
  const audio = editorAudio(fetchClip, () => output, () => wallMs);
  let panel: ClockPanel = DISCONNECTED;
  const stream = (event: StreamEvent) => {
    panel = foldClock(panel, event);
    audio.clock(panel, event);
  };
  return {
    audio,
    output,
    played,
    fetched,
    advance: (ms: number) => {
      wallMs += ms;
      output.currentTime += ms / 1000;
    },
    stream,
    clock: (state: ClockPanel["state"] & string, scriptTime: number, speed = 1) =>
      stream({ type: "clock", state, scriptTime, speed, cause: state === "playing" ? "play" : "pause" }),
    previewing: (previewing: boolean) => audio.script({ words, scriptEnd: SCRIPT_END, previewing }),
  };
}

const starts = (played: Played[]) => played.map(({ clip, start }) => [clip.from, ...start.mock.calls[0]]);

describe("the editor's Preview sound", () => {
  it("stays silent while the clock plays a Performance the editor didn't start", async () => {
    const { clock, previewing, fetched } = harness();
    previewing(false);

    clock("playing", 0);
    await settle();

    expect(fetched).toEqual([]);
  });

  it("starts each clip within the lookahead when the clock reaches its Word", async () => {
    const { clock, previewing, played } = harness();
    clock("playing", 0);

    previewing(true);
    await settle();

    expect(starts(played)).toEqual([
      [1_200, 0.4, 0, 0.3],
      [1_600, 1, 0, 0.3],
    ]);
  });

  it("schedules later Words as ticks bring them within the lookahead", async () => {
    const { clock, previewing, played, advance, stream } = harness();
    clock("playing", 0);
    previewing(true);
    await settle();

    advance(1_100);
    stream({ type: "tick", scriptTime: 1_100 });
    await settle();

    expect(played.map(({ clip }) => clip.from)).toEqual([1_200, 1_600, 2_000]);
    expect(played[2].start).toHaveBeenCalledWith(3, 0, 0.3);
  });

  it("stops what it scheduled when the clock pauses, and starts nothing that arrives after", async () => {
    const { clock, previewing, played, fetched } = harness();
    clock("playing", 0);
    previewing(true);

    clock("paused", 0);
    await settle();

    expect(fetched).toHaveLength(2);
    expect(played.every(({ start }) => start.mock.calls.length === 0)).toBe(true);
  });

  it("starts again from where the clock lands after a seek", async () => {
    const { clock, previewing, played, advance, stream } = harness();
    clock("playing", 0);
    previewing(true);
    await settle();
    advance(100);

    stream({
      type: "snapshot",
      protocolVersion: 1,
      scriptVersion: 1,
      clock: { state: "playing", scriptTime: 1_150, speed: 1 },
      currentWord: null,
      passedEvents: [],
    });
    await settle();

    expect(played.slice(0, 2).every(({ stop }) => stop.mock.calls.length === 1)).toBe(true);
    expect(starts(played.slice(2))).toEqual([
      [1_750, 0.1, 0, 0.15],
      [2_000, expect.closeTo(1.95), 0, 0.3],
    ]);
  });
});

describe("Listen", () => {
  it("plays the clip at once, cutting short the one before", async () => {
    const { audio, played } = harness();

    await audio.listen({ recording: "r1", from: 200, until: 2_500 });
    await audio.listen({ recording: "r1", from: 600, until: 2_900 });

    expect(played.map(({ clip }) => clip.from)).toEqual([200, 600]);
    expect(played[0].stop).toHaveBeenCalled();
    expect(played[1].start).toHaveBeenCalledWith();
  });

  it("plays only the last of several asked for at once", async () => {
    const { audio, played } = harness();

    await Promise.all([
      audio.listen({ recording: "r1", from: 200, until: 2_500 }),
      audio.listen({ recording: "r1", from: 600, until: 2_900 }),
    ]);

    expect(played.filter(({ start }) => start.mock.calls.length > 0).map(({ clip }) => clip.from)).toEqual([600]);
  });
});
