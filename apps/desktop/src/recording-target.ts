import { indexAfter, type Caret, type Range } from "./caret";
import { selectedWords } from "./clipboard";
import type { InsertionPoint, ScriptWord } from "./session";

/** Where a Recording goes: over the Words it Re-records, or at an Insertion Point. */
export type RecordingTarget = { reRecord: string[] } | { insertAt: InsertionPoint };

/** Re-records the Words a selection covers any part of, and otherwise inserts at its start. */
export function recordingTargetAt(words: ScriptWord[], range: Range | null): RecordingTarget {
  const selected = range ? selectedWords(words, range) : [];
  if (selected.length) return { reRecord: selected };
  return { insertAt: insertionPointAt(words, range?.start ?? null) };
}

/**
 * Where a Recording lands from the caret: before the Word the caret starts or the one after a
 * slot, after a Word the caret is inside, and at the end with no caret.
 */
export function insertionPointAt(words: ScriptWord[], caret: Caret | null): InsertionPoint {
  if (!caret) return { before: null };
  const index = "slotAfter" in caret || caret.offset === 0 ? indexAfter(words, caret) : indexAfter(words, caret) + 1;
  return { before: words[index]?.id ?? null };
}
