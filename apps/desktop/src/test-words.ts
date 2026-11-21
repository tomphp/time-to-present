import type { ScriptWord } from "./session";

export const scriptWord = (id: string, text: string, timing: Partial<ScriptWord> = {}): ScriptWord => ({
  id,
  text,
  start: 0,
  gap: 0,
  duration: 300,
  recordingId: null,
  audioStart: null,
  audioEnd: null,
  confidence: null,
  ...timing,
});
