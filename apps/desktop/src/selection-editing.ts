import { chars, endOf, indexAfter, indexBefore, isSlot, type CaretTarget, type Range } from "./caret";
import type { Edit, ScriptWord } from "./session";
import type { Outcome } from "./text-editing";

/**
 * Replaces a selection with text: the Words it starts and ends inside keep what is outside it,
 * the Words wholly inside it go, and a Word that is left empty goes too.
 */
export function replaceSelection(words: ScriptWord[], { start, end }: Range, replacement: string): Outcome | null {
  const first = indexAfter(words, start);
  const last = indexBefore(words, end);
  if (first > last && !(isSlot(start) && replacement)) return null;
  const head = isSlot(start) ? null : chars(words[first].text).slice(0, start.offset).join("") + replacement;
  const tail = isSlot(end) ? null : chars(words[last].text).slice(end.offset).join("");

  const edits: Edit[] = [];
  const deleted: string[] = [];
  for (let index = first; index <= last; index++) {
    const word = words[index];
    const kept = (index === first ? (head ?? "") : "") + (index === last ? (tail ?? "") : "");
    if (kept === "") deleted.push(word.id);
    else if (kept !== word.text) edits.push({ kind: "correct", word: word.id, text: kept });
  }
  if (isSlot(start) && replacement) edits.push({ kind: "insertWord", after: start.slotAfter, text: replacement });
  if (deleted.length) edits.push({ kind: "delete", words: deleted });
  if (edits.length === 0) return null;
  return { edit: edits.length === 1 ? edits[0] : { kind: "batch", edits }, caret: caretAfter() };

  function caretAfter(): CaretTarget {
    if (!isSlot(start) && head) return { word: start.word, offset: chars(head).length };
    if (isSlot(start) && replacement) return { wordAfter: start.slotAfter, offset: chars(replacement).length };
    if (!isSlot(end) && tail) return { word: end.word, offset: 0 };
    return endOf(words, first - 1);
  }
}
