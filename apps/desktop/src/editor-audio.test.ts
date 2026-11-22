import { describe, expect, it, vi } from "vitest";
import type { Clip } from "./audio-schedule";
import { DISCONNECTED, foldClock, type ClockPanel } from "./clock-view";
import { editorAudio, type AudioOutput } from "./editor-audio";
import type { StreamEvent } from "./session";
import { scriptWord } from "./test-words";

const spoken = (id: string, start: number, audioStart: number, duration = 300) =>
  scriptWord(id, id, { start, duration, recordingId: "r1", audioStart, audioEnd: audioStart + duration });

const words = [spoken("w1", 400, 1_200), spoken("w2", 1_000, 1_600), spoken("w3", 3_000, 2_000)];
const SCRIPT_END = 3_300;

interface Played {
  clip: Clip;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  gain: { setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

function harness(script = { words, scriptEnd: SCRIPT_END }) {
  let wallMs = 0;
  const played: Played[] = [];
  const fetched: Clip[] = [];
  const output = { currentTime: 0, destination: {}, resume: vi.fn(async () => {}) } as unknown as AudioOutput & {
    currentTime: number;
  };
  output.decodeAudioData = vi.fn(async (data: ArrayBuffer) => data as unknown as AudioBuffer);
  const gains = new Map<object, Played["gain"]>();
  output.createGain = () => {
    const gain = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    gains.set(gain, gain.gain);
    return gain as unknown as GainNode;
  };
  output.createBufferSource = () => {
    const node = { connect: vi.fn((gain: object) => gains.get(gain) && (played.at(-1)!.gain = gains.get(gain)!)), start: vi.fn(), stop: vi.fn(), buffer: null as unknown };
    Object.defineProperty(node, "buffer", {
      set: (clip: Clip) => played.push({ clip, start: node.start, stop: node.stop, gain: undefined as never }),
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
    previewing: (previewing: boolean) => audio.script({ ...script, previewing }),
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

describe("a long Audio Run", () => {
  const longRun = {
    words: Array.from({ length: 6 }, (_, index) => spoken(`w${index + 1}`, index * 700, index * 700, 600)),
    scriptEnd: 4_100,
  };
  const sounding = (played: Played[]) => played.filter(({ start, stop }) => start.mock.calls.length > 0 && stop.mock.calls.length === 0);

  it("sounds its pieces back to back on the audio clock, topping up the lookahead without fetching any piece twice", async () => {
    const { clock, previewing, played, fetched, advance, stream } = harness(longRun);
    clock("playing", 0);
    previewing(true);
    await settle();

    advance(1_000);
    stream({ type: "tick", scriptTime: 1_000 });
    await settle();

    expect(fetched.map(({ from, until }) => [from, until])).toEqual([
      [0, 1_400],
      [1_400, 2_800],
      [2_800, 4_100],
    ]);
    expect(starts(played)).toEqual([
      [0, 0, 0, expect.closeTo(1.4)],
      [1_400, expect.closeTo(1.4), 0, expect.closeTo(1.4)],
      [2_800, expect.closeTo(2.8), 0, expect.closeTo(1.3)],
    ]);
  });

  it("joins part way where a Preview starts inside it", async () => {
    const { clock, previewing, played } = harness(longRun);
    clock("playing", 1_500);

    previewing(true);
    await settle();

    expect(starts(played)[0]).toEqual([1_500, 0, 0, expect.closeTo(1.3)]);
  });

  it("stops everything when the Preview stops", async () => {
    const { clock, previewing, played } = harness(longRun);
    clock("playing", 0);
    previewing(true);
    await settle();

    previewing(false);

    expect(sounding(played)).toEqual([]);
  });

  it("picks up where the sound paused when the Preview resumes", async () => {
    const { clock, previewing, played, advance } = harness(longRun);
    clock("playing", 0);
    previewing(true);
    await settle();
    advance(700);
    clock("paused", 700);
    advance(5_000);

    clock("playing", 700);
    await settle();

    expect(starts(sounding(played))).toEqual([[700, expect.closeTo(5.7), 0, expect.closeTo(0.7)], [1_400, expect.closeTo(6.4), 0, expect.closeTo(1.4)]]);
  });

  it("picks up where the sound paused after a speed change while paused, never sounding it again", async () => {
    const { clock, previewing, played, advance, stream } = harness(longRun);
    clock("playing", 0);
    previewing(true);
    await settle();
    advance(300);
    clock("paused", 300);
    stream({ type: "clock", state: "paused", scriptTime: 300, speed: 2, cause: "speed" });

    clock("playing", 300, 2);
    await settle();

    expect(starts(sounding(played))[0]).toEqual([300, expect.closeTo(0.45), 0, expect.closeTo(0.05)]);
  });

  it("joins part way where a seek lands", async () => {
    const { clock, previewing, played, advance } = harness(longRun);
    clock("playing", 0);
    previewing(true);
    await settle();
    advance(200);

    clock("playing", 3_000);
    await settle();

    expect(starts(sounding(played))[0]).toEqual([3_000, expect.closeTo(0.2), 0, expect.closeTo(1.1)]);
  });
});

describe("gain ramps", () => {
  const longRun = {
    words: Array.from({ length: 6 }, (_, index) => spoken(`w${index + 1}`, index * 700, index * 700, 600)),
    scriptEnd: 4_100,
  };
  const rampsOf = ({ gain }: Played) => [gain.setValueAtTime.mock.calls, gain.linearRampToValueAtTime.mock.calls];

  it("ramps in at the start of a Run and out at its end, and not at joins between its pieces", async () => {
    const { clock, previewing, played, advance, stream } = harness(longRun);
    clock("playing", 0);
    previewing(true);
    await settle();
    advance(1_000);
    stream({ type: "tick", scriptTime: 1_000 });
    await settle();

    const [first, middle, last] = played;
    expect(rampsOf(first)).toEqual([[[0, 0]], [[1, 0.005]]]);
    expect(rampsOf(middle)).toEqual([[], []]);
    expect(rampsOf(last)[0]).toEqual([[1, expect.closeTo(4.095)]]);
    expect(rampsOf(last)[1]).toEqual([[0, expect.closeTo(4.1)]]);
  });

  it("ramps in a middle piece that arrives late and so starts part way in", async () => {
    const { clock, previewing, played, advance } = harness(longRun);
    clock("playing", 0);
    previewing(true);
    advance(1_500);
    await settle();

    expect(rampsOf(played[1])[0][0]).toEqual([0, expect.closeTo(1.5)]);
  });

  it("ramps in where a Run is joined part way after a seek", async () => {
    const { clock, previewing, played } = harness(longRun);
    clock("playing", 1_500);

    previewing(true);
    await settle();

    expect(rampsOf(played[0])[0][0]).toEqual([0, 0]);
    expect(rampsOf(played[0])[1][0]).toEqual([1, 0.005]);
  });
});

describe("a speed change", () => {
  it("never sounds again the part of a Word already heard", async () => {
    const { clock, previewing, played, advance, stream } = harness();
    clock("playing", 0);
    previewing(true);
    await settle();
    advance(500);

    stream({ type: "clock", state: "playing", scriptTime: 500, speed: 2, cause: "speed" });
    await settle();

    expect(played.slice(0, 2).every(({ stop }) => stop.mock.calls.length === 1)).toBe(true);
    expect(starts(played.slice(2))[0]).toEqual([1_300, expect.closeTo(0.55), 0, expect.closeTo(0.2)]);
  });
});

describe("the repeat", () => {
  it("never sounds Test1's Retimed, overlapping final three Words twice", async () => {
    const test1FinalWords = [
      scriptWord("minutes", "minutes", { start: 57_000, duration: 1_028, recordingId: "r1", audioStart: 59_140, audioEnd: 60_200 }),
      scriptWord("to", "to", { start: 58_028, duration: 1_145, recordingId: "r1", audioStart: 59_400, audioEnd: 60_580 }),
      scriptWord("make", "make.", { start: 59_173, duration: 1_746, recordingId: "r1", audioStart: 59_680, audioEnd: 61_480 }),
    ];
    const { clock, previewing, played, advance, stream } = harness({ words: test1FinalWords, scriptEnd: 60_919 });
    clock("playing", 57_000);
    previewing(true);
    await settle();

    advance(1_000);
    stream({ type: "tick", scriptTime: 58_000 });
    await settle();

    expect(played.map(({ clip }) => [clip.from, clip.until])).toEqual([
      [59_140, 59_400],
      [59_400, 59_680],
      [59_680, 61_426],
    ]);
    expect(starts(played)).toEqual([
      [59_140, 0, 0, expect.closeTo(0.26)],
      [59_400, expect.closeTo(1.028), 0, expect.closeTo(0.28)],
      [59_680, expect.closeTo(2.173), 0, expect.closeTo(1.746)],
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
