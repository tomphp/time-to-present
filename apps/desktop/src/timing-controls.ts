import type { Edit, ScriptWord } from "./session";

const NUDGE_MS = 10;
const SHIFT_NUDGE_MS = 100;

export interface Nudge {
  run: string;
  edit: Edit;
}

/** `[` and `]` nudge a Word's Gap earlier and later, and with Alt its duration. */
export function nudgeOf(
  key: { code: string; shiftKey: boolean; altKey: boolean },
  word: string,
): Nudge | null {
  const direction = key.code === "BracketLeft" ? -1 : key.code === "BracketRight" ? 1 : 0;
  if (direction === 0) return null;
  const by = direction * (key.shiftKey ? SHIFT_NUDGE_MS : NUDGE_MS);
  return key.altKey
    ? { run: `duration:${word}`, edit: { kind: "trimEnd", word, by } }
    : { run: `gap:${word}`, edit: { kind: "move", word, by } };
}

const wholeMs = (text: string) => (/^-?\d+$/.test(text.trim()) ? Number(text) : null);

export function fieldEdit(field: "gap" | "duration", word: ScriptWord, text: string): Edit | null {
  const value = wholeMs(text);
  if (value === null || value === word[field]) return null;
  const by = value - word[field];
  return field === "gap" ? { kind: "move", word: word.id, by } : { kind: "trimEnd", word: word.id, by };
}

export function offsetEdit(event: string, text: string): Edit | null {
  const offset = wholeMs(text);
  return offset === null ? null : { kind: "setOffset", event, offset };
}

export function retimeEdit(words: string[], text: string): Edit | null {
  const percent = Number(text);
  return words.length === 0 || !(percent > 0) ? null : { kind: "retime", words, percent };
}
