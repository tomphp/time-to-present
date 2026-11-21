import { collapsed, isSlot, lastId, resolveCaret, type CaretTarget, type Range, type Slot } from "./caret";
import { currentCaret, placeCaret, selectedRange } from "./dom-caret";
import { eventAnchorAt, type EventAt } from "./named-events";
import { renderScript } from "./pane-render";
import type { Edit, ScriptWord, SessionState } from "./session";
import { applyInput, type Input } from "./text-editing";

export interface Commands {
  edit(edit: Edit): Promise<SessionState>;
  undo(): Promise<SessionState>;
  redo(): Promise<SessionState>;
}

export interface EventHooks {
  insertEventAt(at: EventAt): void;
  selectEvent(id: string): void;
}

export type PaneScript = Pick<SessionState, "words" | "namedEvents" | "movedEvents">;

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
 */
export function mountTextPane(root: HTMLElement, commands: Commands, events: EventHooks) {
  let script: PaneScript = { words: [], namedEvents: [], movedEvents: [] };
  let words: ScriptWord[] = [];
  let selectedEvent: string | null = null;
  let slot: Slot | null = null;
  let pending: CaretTarget | null = null;
  let lastCaret: CaretTarget | null = null;
  let queued = 0;
  let queue = Promise.resolve();

  root.contentEditable = "true";
  root.spellcheck = false;

  function render(next: PaneScript) {
    script = next;
    words = next.words;
    const target = pending ?? (root.contains(document.activeElement) ? currentCaret(root) : null);
    pending = null;
    const caret = target && resolveCaret(target, words);
    slot = caret && isSlot(caret) ? caret : null;
    renderScript(root, words, slot, { events: next.namedEvents, moved: next.movedEvents, selected: selectedEvent });
    if (caret) placeCaret(root, caret);
  }

  function selectEvent(id: string | null) {
    selectedEvent = id;
    render(script);
    if (id) root.querySelector(`[data-event-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }

  /** Puts the caret back where it was before an event took the focus. */
  function focus() {
    pending = lastCaret ?? { slotAfter: lastId(words) };
    render(script);
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
      if (!outcome.edit) return render(script);
      await commands.edit(outcome.edit).then(render, reportAndDrop);
    });
  });

  root.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey)) return;
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

  root.addEventListener("click", (event) => {
    const chip = (event.target as Element).closest<HTMLElement>("[data-event-id]");
    if (chip) {
      lastCaret = currentCaret(root) ?? lastCaret;
      events.selectEvent(chip.dataset.eventId!);
    }
  });

  document.addEventListener("selectionchange", () => {
    if (!slot || queued > 0) return;
    const caret = currentCaret(root);
    if (caret && !isSlot(caret)) render(script);
  });

  function reportAndDrop(error: unknown) {
    console.error(error);
    pending = null;
    lastCaret = { slotAfter: lastId(words) };
  }

  return { render, selectEvent, focus };
}

function inputFrom(event: InputEvent): Input | null {
  if (event.inputType === "insertText" && event.data) return { type: "insertText", text: event.data };
  return INPUT_TYPES[event.inputType] ?? null;
}
