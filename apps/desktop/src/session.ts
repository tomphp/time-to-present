export type BreakAfter = "line" | "paragraph";

export interface ScriptWord {
  id: string;
  text: string;
  start: number;
  gap: number;
  duration: number;
  recordingId: string | null;
  audioStart: number | null;
  audioEnd: number | null;
  confidence: number | null;
  breakAfter?: BreakAfter;
}

export const SCRIPT_START = "scriptStart";

export interface TimedEvent {
  id: string;
  name: string;
  data?: unknown;
  /** A Word id, or SCRIPT_START. */
  anchor: string;
  offset: number;
  time: number;
}

export interface SessionState {
  folder: string;
  title: string;
  words: ScriptWord[];
  namedEvents: TimedEvent[];
  movedEvents: string[];
  scriptEnd: number;
  recordingBar: RecordingBarState | null;
  pendingPassages: PendingPassage[];
  locked: boolean;
}

/** The caret between Words where a Recording lands: before a Word, or at the end. */
export interface InsertionPoint {
  before: string | null;
}

export type PendingStatus =
  | { kind: "queued" }
  | { kind: "fetchingModel"; percent: number | null }
  | { kind: "transcribing"; percent: number }
  | { kind: "failed"; reason: string };

/** A stopped Recording whose Transcription has not landed, anchored to the Words either side. */
export interface PendingPassage {
  recordingId: string;
  after: string | null;
  before: string | null;
  status: PendingStatus;
}

export interface Input {
  name: string;
  channels: number;
  sampleRate: number;
}

export interface InputChoice {
  device: string | null;
  channel: number;
}

export interface RecordingBarState {
  access: "granted" | "denied";
  inputs: Input[];
  input: { choice: InputChoice; device: Input } | null;
  notice: string | null;
  recording: boolean;
}

export interface Meter {
  peak: number;
  clipped: boolean;
  recorded: number | null;
}

export type Edit =
  | { kind: "correct"; word: string; text: string }
  | { kind: "split"; word: string; at: number }
  | { kind: "merge"; word: string }
  | { kind: "delete"; words: string[] }
  | { kind: "setBreak"; word: string; breakAfter: BreakAfter | null }
  | { kind: "insertWord"; after: string | null; text: string }
  | { kind: "insertEvent"; anchor: string; offset: number; name: string; data?: unknown }
  | { kind: "setEvent"; event: string; name: string; data?: unknown }
  | { kind: "moveEvent"; event: string; anchor: string; offset: number }
  | { kind: "move"; word: string; by: number }
  | { kind: "trimStart"; word: string; by: number }
  | { kind: "trimEnd"; word: string; by: number }
  | { kind: "setOffset"; event: string; offset: number }
  | { kind: "retime"; words: string[]; percent: number }
  | { kind: "batch"; edits: Edit[] };

export interface Waveform {
  bucket: number;
  peaks: number[];
}

export type ClockState = "ready" | "playing" | "paused" | "ended";

export interface ClockView {
  state: ClockState;
  scriptTime: number;
  speed: number;
}

export interface WordPayload {
  id: string;
  text: string;
  start: number;
  duration: number;
}

export interface EventPayload {
  id: string;
  name: string;
  data: unknown;
  scriptTime: number;
}

export interface Snapshot {
  protocolVersion: number;
  scriptVersion: number;
  clock: ClockView;
  currentWord: WordPayload | null;
  passedEvents: EventPayload[];
}

export type ClockCause = "play" | "pause" | "speed" | "end" | "reset";

export type StreamEvent =
  | ({ type: "snapshot" } & Snapshot)
  | ({ type: "clock"; cause: ClockCause } & ClockView)
  | { type: "tick"; scriptTime: number }
  | ({ type: "word" } & WordPayload)
  | ({ type: "namedEvent" } & EventPayload)
  | { type: "closed"; reason: string };
