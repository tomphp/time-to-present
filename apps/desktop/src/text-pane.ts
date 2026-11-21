import { collapsed, isSlot, lastId, resolveCaret, type CaretTarget, type Slot } from "./caret";
import { currentCaret, placeCaret, selectedRange } from "./dom-caret";
import { renderScript } from "./pane-render";
import type { Edit, ScriptWord, SessionState } from "./session";
import { applyInput, type Input } from "./text-editing";

export interface Commands {
  edit(edit: Edit): Promise<SessionState>;
  undo(): Promise<SessionState>;
  redo(): Promise<SessionState>;
}

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
export function mountTextPane(root: HTMLElement, commands: Commands) {
  let words: ScriptWord[] = [];
  let slot: Slot | null = null;
  let pending: CaretTarget | null = null;
  let lastCaret: CaretTarget | null = null;
  let queued = 0;
  let queue = Promise.resolve();

  root.contentEditable = "true";
  root.spellcheck = false;

  function render(next: ScriptWord[]) {
    words = next;
    const target = pending ?? (root.contains(document.activeElement) ? currentCaret(root) : null);
    pending = null;
    const caret = target && resolveCaret(target, words);
    slot = caret && isSlot(caret) ? caret : null;
    renderScript(root, words, slot);
    if (caret) placeCaret(root, caret);
  }

  function enqueue(work: () => Promise<void>) {
    queued++;
    queue = queue.then(work, work).finally(() => queued--);
  }

  root.addEventListener("beforeinput", (event) => {
    event.preventDefault();
    const input = inputFrom(event);
    if (!input) return;
    const domRange = selectedRange(root);
    const domIsStale = queued > 0;
    enqueue(async () => {
      const range = domIsStale && lastCaret ? collapsed(resolveCaret(lastCaret, words)) : domRange;
      if (!range) return;
      const outcome = applyInput(words, range, input);
      lastCaret = outcome?.caret ?? range.start;
      if (!outcome) return;
      pending = outcome.caret;
      if (!outcome.edit) return render(words);
      await commands.edit(outcome.edit).then((state) => render(state.words), reportAndDrop);
    });
  });

  root.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    const command = event.shiftKey ? commands.redo : commands.undo;
    enqueue(() => command().then((state) => render(state.words), reportAndDrop));
  });

  document.addEventListener("selectionchange", () => {
    if (!slot || queued > 0) return;
    const caret = currentCaret(root);
    if (caret && !isSlot(caret)) render(words);
  });

  function reportAndDrop(error: unknown) {
    console.error(error);
    pending = null;
    lastCaret = { slotAfter: lastId(words) };
  }

  return { render };
}

function inputFrom(event: InputEvent): Input | null {
  if (event.inputType === "insertText" && event.data) return { type: "insertText", text: event.data };
  return INPUT_TYPES[event.inputType] ?? null;
}
