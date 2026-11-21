import { chars, endOf, indexOf, isSlot, sameCaret, type Caret, type Range } from "./caret";
import type { ScriptWord } from "./session";

const SEPARATORS = { line: "\n", paragraph: "\n\n" } as const;

/** The ids of the Words a selection covers any part of. */
export function selectedWords(words: ScriptWord[], { start, end }: Range): string[] {
  if (sameCaret(start, end)) return [];
  const first = isSlot(start)
    ? indexOf(words, start.slotAfter) + 1
    : indexOf(words, start.word) + (start.offset >= wordLength(words, start.word) ? 1 : 0);
  const last = isSlot(end) ? indexOf(words, end.slotAfter) : indexOf(words, end.word) - (end.offset === 0 ? 1 : 0);
  return words.slice(first, last + 1).map((word) => word.id);
}

/** The text a passage puts on the system clipboard, its breaks as line endings. */
export function passageText(words: ScriptWord[]): string {
  return words
    .map((word, index) => word.text + (index < words.length - 1 ? separatorAfter(word) : ""))
    .join("");
}

/** Where a paste over a selection goes: after a Word, or null at the start, replacing the Words it covers. */
export function pasteAt(words: ScriptWord[], range: Range): { after: string | null; replacing: string[] } {
  const replacing = selectedWords(words, range);
  if (replacing.length === 0) return { after: pasteAfter(words, range.start), replacing };
  return { after: words[indexOf(words, replacing[0]) - 1]?.id ?? null, replacing };
}

/** Where the caret goes once a paste after `after` has made the Script `next`. */
export function caretAfterPaste(previous: ScriptWord[], next: ScriptWord[], { after, replacing }: ReturnType<typeof pasteAt>): Caret {
  const added = next.length - (previous.length - replacing.length);
  return endOf(next, Math.min(indexOf(next, after) + added, next.length - 1));
}

function pasteAfter(words: ScriptWord[], caret: Caret): string | null {
  if (isSlot(caret)) return caret.slotAfter;
  if (caret.offset > 0) return caret.word;
  return words[indexOf(words, caret.word) - 1]?.id ?? null;
}

const separatorAfter = (word: ScriptWord) => (word.breakAfter ? SEPARATORS[word.breakAfter] : " ");

const wordLength = (words: ScriptWord[], id: string) => chars(words[indexOf(words, id)].text).length;
