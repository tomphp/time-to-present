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
}
