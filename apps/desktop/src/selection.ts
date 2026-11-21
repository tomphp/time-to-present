import { chars, indexAfter, indexBefore, indexOf, isSlot, sameCaret, type Range } from "./caret";
import type { InsertionPoint, ScriptWord } from "./session";

/** The one selection the text pane and the timeline share: a run of Words from anchor to focus. */
export interface WordSelection {
  anchor: string;
  focus: string;
}

/** Holds the shared selection, calling `show` with its Words whenever they change. */
export function sharedSelection(show: (ids: string[]) => void) {
  let words: ScriptWord[] = [];
  let current: WordSelection | null = null;

  function set(next: WordSelection | null) {
    if (sameSelection(words, current, next)) return;
    current = next;
    show(selectedIds(words, current));
  }

  return {
    update(next: ScriptWord[]) {
      words = next;
      if (selectedIds(words, current).length === 0) current = null;
    },
    ids: () => selectedIds(words, current),
    fromText: (range: Range) => set(selectionOfRange(words, range)),
    /** Picks a Word on the timeline, returning the range the text pane should select. */
    fromTimeline(word: string, extend: boolean): Range | null {
      set(clickSelection(current, word, extend));
      return rangeOfSelection(words, current);
    },
  };
}

export function selectedIds(words: ScriptWord[], selection: WordSelection | null): string[] {
  if (!selection) return [];
  const anchor = indexOf(words, selection.anchor);
  const focus = indexOf(words, selection.focus);
  if (anchor < 0 || focus < 0) return [];
  return words.slice(Math.min(anchor, focus), Math.max(anchor, focus) + 1).map((word) => word.id);
}

export function sameSelection(words: ScriptWord[], a: WordSelection | null, b: WordSelection | null) {
  return sameIds(selectedIds(words, a), selectedIds(words, b));
}

export const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

export const clickSelection = (current: WordSelection | null, word: string, extend: boolean): WordSelection => ({
  anchor: extend && current ? current.anchor : word,
  focus: word,
});

/** The Words a text pane selection covers any of; a caret selects the Word it is in. */
export function selectionOfRange(words: ScriptWord[], { start, end }: Range): WordSelection | null {
  if (sameCaret(start, end)) return isSlot(start) ? null : { anchor: start.word, focus: start.word };
  let first = indexAfter(words, start);
  let last = indexBefore(words, end);
  if (!isSlot(start) && start.offset >= chars(words[first].text).length) first++;
  if (!isSlot(end) && end.offset === 0) last--;
  if (first > last) return null;
  return { anchor: words[first].id, focus: words[last].id };
}

export function rangeOfSelection(words: ScriptWord[], selection: WordSelection | null): Range | null {
  const ids = selectedIds(words, selection);
  if (ids.length === 0) return null;
  const last = words[indexOf(words, ids[ids.length - 1])];
  return { start: { word: ids[0], offset: 0 }, end: { word: last.id, offset: chars(last.text).length } };
}

/** Where a Preview starts: the first selected Word, or the Word after the caret, or the start once the caret is at the end. */
export function previewFrom(words: ScriptWord[], selected: string[], caret: InsertionPoint): number {
  const id = selected[0] ?? caret.before;
  return words.find((word) => word.id === id)?.start ?? 0;
}
