export type BreakAfter = "line" | "paragraph";

export interface ScriptWord {
  id: string;
  text: string;
  start: number;
  duration: number;
  breakAfter?: BreakAfter;
}

export interface SessionState {
  folder: string;
  title: string;
  words: ScriptWord[];
  scriptEnd: number;
  recordingBar: RecordingBarState | null;
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
  input: { choice: InputChoice; input: Input } | null;
  notice: string | null;
  recording: boolean;
}

export interface Meter {
  peak: number;
  clipped: boolean;
  recorded: number | null;
}
