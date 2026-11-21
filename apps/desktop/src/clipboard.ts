import { chars, indexOf, isSlot, sameCaret, type Caret, type Range } from "./caret";
import type { ScriptWord } from "./session";

const SEPARATORS = { line: "\n", paragraph: "\n\n" } as const;

/** The ids of the Words a selection covers any part of. */
export function selectedWords(words: ScriptWord[], { start, end }: Range): string[] {
  if (sameCaret(start, end)) return [];
  const first = isSlot(start)
    ? indexOf(words, start.slotAfter) + 1
    : indexOf(words, start.word) + (start.offset >= length(words, start.word) ? 1 : 0);
  const last = isSlot(end) ? indexOf(words, end.slotAfter) : indexOf(words, end.word) - (end.offset === 0 ? 1 : 0);
  return words.slice(first, last + 1).map((word) => word.id);
}

/** The text a passage puts on the system clipboard, its breaks as line endings. */
export function passageText(words: ScriptWord[]): string {
  return words
    .map((word, index) => word.text + (index < words.length - 1 ? separatorAfter(word) : ""))
    .join("");
}

/** The Word a paste at the caret goes after, or null for the start of the Script. */
export function pasteAfter(words: ScriptWord[], caret: Caret): string | null {
  if (isSlot(caret)) return caret.slotAfter;
  if (caret.offset > 0) return caret.word;
  return words[indexOf(words, caret.word) - 1]?.id ?? null;
}

const separatorAfter = (word: ScriptWord) => (word.breakAfter ? SEPARATORS[word.breakAfter] : " ");

const length = (words: ScriptWord[], id: string) => chars(words[indexOf(words, id)].text).length;
