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

/** Whether the same Pending Passages sit at the same anchors, in the same order, whatever their progress. */
export function samePlacement(a: PendingPassage[], b: PendingPassage[]): boolean {
  const placement = (passages: PendingPassage[]) => passages.map(({ recordingId, after, before }) => [recordingId, after, before]);
  return JSON.stringify(placement(a)) === JSON.stringify(placement(b));
}

/** Brings each placeholder under `root` up to its passage's progress, leaving the rest of the DOM alone. */
export function refreshPending(root: HTMLElement, pending: PendingPassage[]) {
  for (const passage of pending) {
    root.querySelector(`[data-recording-id="${passage.recordingId}"]`)?.replaceWith(pendingElement(passage));
  }
}

export interface PendingActions {
  retry(recordingId: string): void;
  discard(recordingId: string): void;
}

/** Runs Retry and Discard from the buttons on the failed placeholders under `root`. */
export function onPendingAction(root: HTMLElement, actions: PendingActions) {
  root.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-retry], [data-discard]");
    const recordingId = button?.closest<HTMLElement>("[data-recording-id]")?.dataset.recordingId;
    if (!button || !recordingId) return;
    event.preventDefault();
    if ("retry" in button.dataset) actions.retry(recordingId);
    else actions.discard(recordingId);
  });
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

/** Anchored between Words, as a Pending Passage or the Live Transcript is. */
export interface Anchored {
  after: string | null;
  before: string | null;
}

/**
 * Each passage keyed by the Word it shows before: its next Word while that exists,
 * else the Word after its previous one, else null for the end of the Script.
 */
export function passagesByPosition<T extends Anchored>(words: ScriptWord[], anchored: T[]) {
  const ids = words.map((word) => word.id);
  const byPosition = new Map<string | null, T[]>();
  for (const item of anchored) {
    const before = item.before !== null && ids.includes(item.before) ? item.before : afterPrevious(ids, item.after);
    byPosition.set(before, [...(byPosition.get(before) ?? []), item]);
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
