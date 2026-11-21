import { audioSchedule, clipTiming, type Anchor, type Clip, type ScheduledClip } from "./audio-schedule";
import { clockPosition, DISCONNECTED, type ClockPanel } from "./clock-view";
import type { ScriptWord, StreamEvent } from "./session";

export type FetchClip = (clip: Clip) => Promise<ArrayBuffer>;

/** The part of an AudioContext the editor plays through. */
export type AudioOutput = Pick<AudioContext, "currentTime" | "destination" | "decodeAudioData" | "createBufferSource" | "resume">;

export interface AudioScript {
  words: ScriptWord[];
  scriptEnd: number;
  previewing: boolean;
}

/** How far ahead of the clock, in Script Time, clips are fetched and scheduled. */
const LOOKAHEAD_MS = 2_000;

interface Run {
  anchor: Anchor;
  scheduled: Set<string>;
  sources: AudioBufferSourceNode[];
}

/**
 * The editor's own sound: Listen, and the clips of a Preview, which play only while the clock
 * is playing a Preview the editor started. Every change of course on the clock (a seek, a speed
 * change, a pause) drops what is scheduled and starts again from where the clock now is.
 */
export function editorAudio(
  fetchClip: FetchClip,
  createOutput: () => AudioOutput = () => new AudioContext(),
  now = () => performance.now(),
) {
  let context: AudioOutput | null = null;
  let script: AudioScript = { words: [], scriptEnd: 0, previewing: false };
  let panel = DISCONNECTED;
  let reportedAt = 0;
  let run: Run | null = null;
  let listening: AudioBufferSourceNode | null = null;
  let listens = 0;

  const audio = () => (context ??= createOutput());

  async function source(clip: Clip) {
    const buffer = await audio().decodeAudioData(await fetchClip(clip));
    const node = audio().createBufferSource();
    node.buffer = buffer;
    node.connect(audio().destination);
    return node;
  }

  function restart() {
    run?.sources.forEach((node) => node.stop());
    run = null;
    if (!script.previewing || panel.state !== "playing") return;
    const scriptTime = clockPosition(panel, now() - reportedAt, script.scriptEnd);
    run = { anchor: { audioTime: audio().currentTime, scriptTime, speed: panel.speed }, scheduled: new Set(), sources: [] };
    topUp();
  }

  function topUp() {
    if (!run) return;
    const horizon = panel.scriptTime + LOOKAHEAD_MS;
    for (const clip of audioSchedule(script.words, script.scriptEnd, run.anchor)) {
      if (clip.at >= horizon) break;
      if (run.scheduled.has(clip.word)) continue;
      run.scheduled.add(clip.word);
      schedule(run, clip).catch(console.error);
    }
  }

  async function schedule(scheduling: Run, clip: ScheduledClip) {
    const node = await source(clip);
    const timing = run === scheduling && clipTiming(clip, scheduling.anchor, audio().currentTime);
    if (!timing) return;
    scheduling.sources.push(node);
    node.start(timing.when, timing.offset, timing.duration);
  }

  return {
    /** Takes the Script and whether a Preview is playing from each published Session state. */
    script(next: AudioScript) {
      const changed = next.previewing !== script.previewing;
      script = next;
      if (changed) restart();
    },
    clock(next: ClockPanel, event: StreamEvent) {
      panel = next;
      reportedAt = now();
      if (event.type === "tick") topUp();
      else if (event.type !== "word" && event.type !== "namedEvent") restart();
    },
    /** Plays a clip now, cutting short whatever was being listened to or is still on its way. */
    async listen(clip: Clip) {
      const asked = ++listens;
      listening?.stop();
      const node = await source(clip);
      if (asked !== listens) return;
      listening?.stop();
      listening = node;
      node.start();
    },
    /** Lets the audio start: call it from the click or key that asked for sound. */
    wake: () => void audio().resume(),
  };
}
