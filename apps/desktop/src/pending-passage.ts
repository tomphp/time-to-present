import { indexAfter, type Caret } from "./caret";
import type { InsertionPoint, PendingPassage, PendingStatus, ScriptWord } from "./session";

/**
 * Where a Recording lands from the caret: before the Word the caret starts or the one after a
 * slot, after a Word the caret is inside, and at the end with no caret.
 */
export function insertionPointAt(words: ScriptWord[], caret: Caret | null): InsertionPoint {
  if (!caret) return { before: null };
  const index = "slotAfter" in caret || caret.offset === 0 ? indexAfter(words, caret) : indexAfter(words, caret) + 1;
  return { before: words[index]?.id ?? null };
}

/** Whether the Pending Passages read the same: same ones, in the same places, at the same progress. */
export function samePending(a: PendingPassage[], b: PendingPassage[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function describePending(status: PendingStatus): string {
  switch (status.kind) {
    case "queued":
      return "Waiting to transcribe…";
    case "fetchingModel":
      return status.percent === null ? "Fetching the speech model…" : `Fetching the speech model… ${status.percent}%`;
    case "transcribing":
      return `Transcribing… ${status.percent}%`;
    case "failed":
      return status.reason;
  }
}

/**
 * Each Pending Passage keyed by the Word it shows before: its next Word while that exists,
 * else the Word after its previous one, else null for the end of the Script.
 */
export function passagesByPosition(words: ScriptWord[], pending: PendingPassage[]) {
  const ids = words.map((word) => word.id);
  const byPosition = new Map<string | null, PendingPassage[]>();
  for (const passage of pending) {
    const before = passage.before !== null && ids.includes(passage.before) ? passage.before : afterPrevious(ids, passage.after);
    byPosition.set(before, [...(byPosition.get(before) ?? []), passage]);
  }
  return byPosition;
}

function afterPrevious(ids: string[], after: string | null) {
  const index = after === null ? -1 : ids.indexOf(after);
  return index < 0 ? null : (ids[index + 1] ?? null);
}

export function pendingElement(passage: PendingPassage) {
  const span = document.createElement("span");
  const failed = passage.status.kind === "failed";
  span.className = failed ? "pending-passage failed" : "pending-passage";
  span.contentEditable = "false";
  span.dataset.recordingId = passage.recordingId;
  span.textContent = describePending(passage.status);
  if (failed) span.append(" ", button("Retry", "retry"), " ", button("Discard", "discard"));
  return span;
}

function button(label: string, action: "retry" | "discard") {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.dataset[action] = "";
  return element;
}
