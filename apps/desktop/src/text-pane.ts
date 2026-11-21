import { collapsed, endOf, indexOf, isSlot, lastId, resolveCaret, type CaretTarget, type Range, type Slot } from "./caret";
import { caretAfterPaste, passageText, pasteAt, selectedWords } from "./clipboard";
import { currentCaret, placeCaret, placeRange, selectedRange } from "./dom-caret";
import { chipDropEdit, eventAnchorAt, sameChips, type ChipDrop, type EventAt } from "./named-events";
import { renderScript } from "./pane-render";
import { insertionPointAt, refreshPending, samePending, samePlacement } from "./pending-passage";
import { sameLayout } from "./script-view";
import type { Edit, ScriptWord, SessionState } from "./session";
import { applyInput, type Input } from "./text-editing";

export interface Commands {
  edit(edit: Edit): Promise<SessionState>;
  cut(words: string[]): Promise<SessionState>;
  copy(words: string[]): Promise<void>;
  paste(after: string | null, replacing: string[], text: string): Promise<SessionState>;
  undo(): Promise<SessionState>;
  redo(): Promise<SessionState>;
}

export interface EventHooks {
  insertEventAt(at: EventAt): void;
  selectEvent(id: string): void;
}

export type PaneScript = Pick<SessionState, "words" | "namedEvents" | "movedEvents" | "pendingPassages" | "locked">;

const INPUT_TYPES: Record<string, Input | undefined> = {
  deleteContentBackward: { type: "deleteBackward" },
  deleteWordBackward: { type: "deleteWordBackward" },
  deleteContentForward: { type: "deleteForward" },
  deleteWordForward: { type: "deleteWordForward" },
  insertParagraph: { type: "insertBreak" },
  insertLineBreak: { type: "insertBreak" },
};

/**
 * The editable text pane. Every keystroke becomes a Session edit and the DOM is only ever
 * rendered from state; inputs queue up so a fast burst lands one after another.
 * It reports every selection made in it, to share with the timeline.
 */
export function mountTextPane(
  root: HTMLElement,
  commands: Commands,
  events: EventHooks,
  onSelect: (range: Range) => void,
) {
  let script: PaneScript = { words: [], namedEvents: [], movedEvents: [], pendingPassages: [], locked: false };
  let locked = false;
  let words: ScriptWord[] = [];
  let selectedEvent: string | null = null;
  let slot: Slot | null = null;
  let pending: CaretTarget | null = null;
  let lastCaret: CaretTarget | null = null;
  let queued = 0;
  let queue = Promise.resolve();

  root.contentEditable = "true";
  root.spellcheck = false;

  function repaint(next: PaneScript) {
    script = next;
    words = next.words;
    const target = pending ?? (root.contains(document.activeElement) ? currentCaret(root) : null);
    pending = null;
    const caret = target && resolveCaret(target, words);
    slot = caret && isSlot(caret) ? caret : null;
    renderScript(
      root,
      words,
      slot,
      { events: next.namedEvents, moved: next.movedEvents, selected: selectedEvent },
      next.pendingPassages,
    );
    if (caret) placeCaret(root, caret);
  }

  /** Where a Recording lands: the caret, or where it last was once the focus has moved on. */
  function insertionPoint() {
    const caret = (root.contains(document.activeElement) && currentCaret(root)) || lastCaret;
    return insertionPointAt(words, caret && resolveCaret(caret, words));
  }

  /**
   * Renders new Session state, leaving the DOM and its selection alone when only timing or
   * Transcription progress changed.
   */
  function render(next: PaneScript) {
    setLocked(next.locked);
    const sameShape =
      !pending && sameLayout(words, next.words) && sameChips(script, next) && samePlacement(script.pendingPassages, next.pendingPassages);
    if (!sameShape) return repaint(next);
    if (!samePending(script.pendingPassages, next.pendingPassages)) refreshPending(root, next.pendingPassages);
    script = next;
    words = next.words;
  }

  function selectEvent(id: string | null) {
    selectedEvent = id;
    repaint(script);
    if (id) root.querySelector(`[data-event-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }

  /** Puts the caret back where it was before an event took the focus. */
  function focus() {
    pending = lastCaret ?? { slotAfter: lastId(words) };
    repaint(script);
  }

  function setLocked(next: boolean) {
    locked = next;
    root.contentEditable = locked ? "false" : "true";
    root.classList.toggle("locked", locked);
  }

  function enqueue(work: () => Promise<void>) {
    queued++;
    queue = queue.then(work, work).finally(() => queued--);
  }

  /**
   * Reads the selection as a keystroke arrives. While earlier keystrokes are still queued the
   * DOM has not caught up, so the range is where the last of them left the caret.
   */
  function selectionAtKeystroke(): () => Range | null {
    const domRange = selectedRange(root);
    const domIsStale = queued > 0;
    return () => (domIsStale && lastCaret ? collapsed(resolveCaret(lastCaret, words)) : domRange);
  }

  root.addEventListener("beforeinput", (event) => {
    event.preventDefault();
    if (locked) return;
    const input = inputFrom(event);
    if (!input) return;
    const selection = selectionAtKeystroke();
    enqueue(async () => {
      const range = selection();
      if (!range) return;
      const outcome = applyInput(words, range, input);
      lastCaret = outcome?.caret ?? range.start;
      if (!outcome) return;
      pending = outcome.caret;
      if (!outcome.edit) return repaint(script);
      await commands.edit(outcome.edit).then(repaint, reportAndDrop);
    });
  });

  root.addEventListener("keydown", (event) => {
    if (locked || !(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      const command = event.shiftKey ? commands.redo : commands.undo;
      enqueue(() => command().then(render, reportAndDrop));
    }
    if (key === "e") {
      event.preventDefault();
      const selection = selectionAtKeystroke();
      enqueue(async () => {
        const caret = selection()?.start ?? { slotAfter: lastId(words) };
        lastCaret = caret;
        events.insertEventAt(eventAnchorAt(words, caret));
      });
    }
  });

  root.addEventListener("copy", (event) => {
    const ids = putOnClipboard(event);
    if (ids.length) enqueue(() => commands.copy(ids).catch(console.error));
  });

  root.addEventListener("cut", (event) => {
    const ids = putOnClipboard(event);
    if (locked || !ids.length) return;
    enqueue(async () => {
      pending = endOf(words, indexOf(words, ids[0]) - 1);
      await commands.cut(ids).then(repaint, reportAndDrop);
    });
  });

  root.addEventListener("paste", (event) => {
    event.preventDefault();
    if (locked) return;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text.trim()) return;
    const selection = selectionAtKeystroke();
    enqueue(async () => {
      const range = selection();
      if (!range) return;
      const at = pasteAt(words, range);
      const previous = words;
      await commands
        .paste(at.after, at.replacing, text)
        .then((next) => {
          pending = caretAfterPaste(previous, next.words, at);
          repaint(next);
        }, reportAndDrop);
    });
  });

  /** Puts the selected Words' text on the system clipboard, returning their ids. */
  function putOnClipboard(event: ClipboardEvent): string[] {
    event.preventDefault();
    const range = selectedRange(root);
    const ids = range ? selectedWords(words, range) : [];
    const taken = new Set(ids);
    if (ids.length) event.clipboardData?.setData("text/plain", passageText(words.filter((w) => taken.has(w.id))));
    return ids;
  }

  const DRAG_THRESHOLD_PX = 4;
  let chipDragged = false;

  /** The Word under the point and the side of it the point is on. */
  function dropAt(x: number, y: number): ChipDrop | null {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-word-id]");
    if (!hit || !root.contains(hit)) return null;
    const { left, width } = hit.getBoundingClientRect();
    return { word: hit.dataset.wordId!, side: x < left + width / 2 ? "before" : "after" };
  }

  root.addEventListener("pointerdown", (down) => {
    const chip = (down.target as Element).closest<HTMLElement>("[data-event-id]");
    if (!chip || down.button !== 0 || locked) return;
    chipDragged = false;
    let dragging = false;
    const move = (event: PointerEvent) => {
      dragging ||= Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > DRAG_THRESHOLD_PX;
      chip.classList.toggle("dragging", dragging);
    };
    const end = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      chip.classList.remove("dragging");
    };
    const cancel = () => end();
    const up = (event: PointerEvent) => {
      end();
      chipDragged = dragging;
      const drop = dragging && !locked ? dropAt(event.clientX, event.clientY) : null;
      if (drop) commands.edit(chipDropEdit(words, chip.dataset.eventId!, drop)).catch(console.error);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
  });

  root.addEventListener("click", (event) => {
    if (chipDragged) {
      chipDragged = false;
      return;
    }
    const chip = (event.target as Element).closest<HTMLElement>("[data-event-id]");
    if (chip && !locked) {
      lastCaret = currentCaret(root) ?? lastCaret;
      events.selectEvent(chip.dataset.eventId!);
    }
  });

  document.addEventListener("selectionchange", () => {
    const range = selectedRange(root);
    if (range) onSelect(range);
    if (!slot || queued > 0) return;
    const caret = currentCaret(root);
    if (caret && !isSlot(caret)) repaint(script);
  });

  function reportAndDrop(error: unknown) {
    console.error(error);
    pending = null;
    lastCaret = { slotAfter: lastId(words) };
  }

  return { render, selectEvent, focus, insertionPoint, select: (range: Range) => placeRange(root, range) };
}

function inputFrom(event: InputEvent): Input | null {
  if (event.inputType === "insertText" && event.data) return { type: "insertText", text: event.data };
  return INPUT_TYPES[event.inputType] ?? null;
}
