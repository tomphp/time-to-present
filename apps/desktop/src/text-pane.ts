import { collapsed, endOf, indexOf, isSlot, lastId, resolveCaret, type CaretTarget, type Range, type Slot } from "./caret";
import { caretAfterPaste, passageText, pasteAt, selectedWords } from "./clipboard";
import { currentCaret, placeCaret, selectedRange } from "./dom-caret";
import { eventAnchorAt, type EventAt } from "./named-events";
import { renderScript } from "./pane-render";
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

  root.addEventListener("copy", (event) => {
    const ids = putOnClipboard(event);
    if (ids.length) enqueue(() => commands.copy(ids).catch(console.error));
  });

  root.addEventListener("cut", (event) => {
    const ids = putOnClipboard(event);
    if (!ids.length) return;
    enqueue(async () => {
      pending = endOf(words, indexOf(words, ids[0]) - 1);
      await commands.cut(ids).then(render, reportAndDrop);
    });
  });

  root.addEventListener("paste", (event) => {
    event.preventDefault();
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
          render(next);
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
