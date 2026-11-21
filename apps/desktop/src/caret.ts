import type { ScriptWord } from "./session";

/** A position in the text pane: inside a Word, or in a slot where a new Word would go. */
export type Caret = { word: string; offset: number } | { slotAfter: string | null };
export interface Range {
  start: Caret;
  end: Caret;
}

/** Where the caret goes once an edit has landed: a Word that may not exist until then. */
export type CaretTarget = Caret | { wordAfter: string | null; offset: number };

export const chars = (text: string) => Array.from(text);

export const isSlot = (caret: Caret): caret is { slotAfter: string | null } => "slotAfter" in caret;

export const sameCaret = (a: Caret, b: Caret) =>
  isSlot(a) ? isSlot(b) && a.slotAfter === b.slotAfter : !isSlot(b) && a.word === b.word && a.offset === b.offset;

export const indexOf = (words: ScriptWord[], id: string | null) =>
  id === null ? -1 : words.findIndex((word) => word.id === id);

/** The index of the first Word at or after the caret, or words.length past the end. */
export function indexAfter(words: ScriptWord[], caret: Caret) {
  return isSlot(caret) ? indexOf(words, caret.slotAfter) + 1 : indexOf(words, caret.word);
}

export function resolveCaret(target: CaretTarget, words: ScriptWord[]): Caret {
  if ("slotAfter" in target) return target;
  const index = "wordAfter" in target ? indexOf(words, target.wordAfter) + 1 : indexOf(words, target.word);
  const word = words[index];
  if (!word || index < 0) return { slotAfter: words.at(-1)?.id ?? null };
  return { word: word.id, offset: Math.min(target.offset, chars(word.text).length) };
}
