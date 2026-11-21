import { audioSchedule, cueTiming, type Anchor, type Clip, type Cue } from "./audio-schedule";
import { clockPosition, DISCONNECTED, type ClockPanel } from "./clock-view";
import type { ScriptWord, StreamEvent } from "./session";

export type FetchClip = (clip: Clip) => Promise<ArrayBuffer>;

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
export function editorAudio(fetchClip: FetchClip) {
  let context: AudioContext | null = null;
  let script: AudioScript = { words: [], scriptEnd: 0, previewing: false };
  let panel = DISCONNECTED;
  let reportedAt = 0;
  let run: Run | null = null;
  let listening: AudioBufferSourceNode | null = null;

  const audio = () => (context ??= new AudioContext());

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
    const scriptTime = clockPosition(panel, performance.now() - reportedAt, script.scriptEnd);
    run = { anchor: { audioTime: audio().currentTime, scriptTime, speed: panel.speed }, scheduled: new Set(), sources: [] };
    topUp();
  }

  function topUp() {
    if (!run) return;
    const horizon = panel.scriptTime + LOOKAHEAD_MS;
    for (const cue of audioSchedule(script.words, script.scriptEnd, run.anchor)) {
      if (cue.at >= horizon) break;
      if (run.scheduled.has(cue.word)) continue;
      run.scheduled.add(cue.word);
      schedule(run, cue).catch(console.error);
    }
  }

  async function schedule(scheduling: Run, cue: Cue) {
    const node = await source(cue);
    const timing = run === scheduling && cueTiming(cue, scheduling.anchor, audio().currentTime);
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
    /** Follows the clock from the editor's event stream. */
    clock(next: ClockPanel, event: StreamEvent) {
      panel = next;
      reportedAt = performance.now();
      if (event.type === "tick") topUp();
      else if (event.type !== "word" && event.type !== "namedEvent") restart();
    },
    /** Plays a clip now, cutting short whatever was being listened to. */
    async listen(clip: Clip) {
      listening?.stop();
      const node = await source(clip);
      listening?.stop();
      listening = node;
      node.start();
    },
    /** Lets the audio start: call it from the click or key that asked for sound. */
    wake: () => void audio().resume(),
  };
}
