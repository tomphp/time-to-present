import { audioSchedule, pieceTiming, type Anchor, type Clip, type ClockPosition, type Piece } from "./audio-schedule";
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

/** How far ahead of the clock, in Script Time, pieces are fetched and scheduled. */
const LOOKAHEAD_MS = 2_000;

/** How close to where the sound stopped the clock must go on from for the sound to carry on, not start afresh. */
const CARRIES_ON_WITHIN_MS = 50;

/** One stretch of a Preview sounding, from a change of course on the clock to the next. */
interface Course {
  anchor: Anchor;
  heardSpeed: number;
  scheduled: Set<string>;
  sources: AudioBufferSourceNode[];
}

/**
 * The editor's own sound: Listen, and the Audio Runs of a Preview, which play only while the clock
 * is playing a Preview the editor started. Every change of course on the clock (a seek, a speed
 * change, a pause) drops what is scheduled and joins the Runs again where the clock now is.
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
  let course: Course | null = null;
  let soundedTo: ClockPosition | null = null;
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

  function soundedUntil({ anchor }: Course) {
    return Math.min(script.scriptEnd, anchor.scriptTime + (audio().currentTime - anchor.audioTime) * 1000 * anchor.speed);
  }

  function restart() {
    if (course) soundedTo = { scriptTime: soundedUntil(course), speed: course.anchor.speed };
    course?.sources.forEach((node) => node.stop());
    course = null;
    if (!script.previewing || panel.state !== "playing") return;
    const scriptTime = clockPosition(panel, now() - reportedAt, script.scriptEnd);
    const heardSpeed = soundedTo && Math.abs(soundedTo.scriptTime - scriptTime) <= CARRIES_ON_WITHIN_MS ? soundedTo.speed : panel.speed;
    course = { anchor: { audioTime: audio().currentTime, scriptTime, speed: panel.speed }, heardSpeed, scheduled: new Set(), sources: [] };
    topUp();
  }

  function topUp() {
    if (!course) return;
    const horizon = panel.scriptTime + LOOKAHEAD_MS;
    for (const piece of audioSchedule(script.words, script.scriptEnd, course.anchor, course.heardSpeed)) {
      if (piece.at >= horizon) break;
      if (course.scheduled.has(piece.key)) continue;
      course.scheduled.add(piece.key);
      schedule(course, piece).catch(console.error);
    }
  }

  async function schedule(scheduling: Course, piece: Piece) {
    const node = await source(piece);
    const timing = course === scheduling && pieceTiming(piece, scheduling.anchor, audio().currentTime);
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
