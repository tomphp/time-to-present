import { chars, isSlot, type Caret } from "./caret";
import { scriptLayout } from "./script-view";
import type { Edit, ScriptWord } from "./session";
import { applyInput, resolveCaret, type CaretTarget, type Input } from "./text-editing";

const SLOT_TEXT = "​";

export interface Commands {
  edit(edit: Edit): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

const INPUT_TYPES: Record<string, Input | undefined> = {
  deleteContentBackward: { type: "deleteBackward" },
  deleteWordBackward: { type: "deleteBackward" },
  deleteContentForward: { type: "deleteForward" },
  deleteWordForward: { type: "deleteForward" },
  insertParagraph: { type: "insertBreak" },
  insertLineBreak: { type: "insertBreak" },
};

/** The editable text pane: every keystroke becomes a Session edit, and the DOM is only ever rendered from state. */
export function mountTextPane(root: HTMLElement, commands: Commands) {
  let words: ScriptWord[] = [];
  let slot: string | null | undefined;
  let pending: CaretTarget | null = null;

  root.contentEditable = "true";
  root.spellcheck = false;

  function render(next: ScriptWord[]) {
    words = next;
    root.replaceChildren(...paragraphs(words, slot));
    if (pending) {
      placeCaret(root, resolveCaret(pending, words));
      pending = null;
    }
  }

  function moveTo(target: CaretTarget) {
    const caret = resolveCaret(target, words);
    slot = isSlot(caret) ? caret.slotAfter : undefined;
    pending = caret;
  }

  root.addEventListener("beforeinput", (event) => {
    event.preventDefault();
    const input = inputFrom(event);
    const range = selectedRange(root);
    if (!input || !range) return;
    const outcome = applyInput(words, range, input);
    if (!outcome) return;
    if (!outcome.edit) {
      moveTo(outcome.caret);
      render(words);
      return;
    }
    const target = outcome.caret;
    slot = "slotAfter" in target ? target.slotAfter : undefined;
    pending = target;
    void commands.edit(outcome.edit).catch(console.error);
  });

  root.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    pending = currentCaret(root) ?? { slotAfter: words.at(-1)?.id ?? null };
    void (event.shiftKey ? commands.redo() : commands.undo()).catch(console.error);
  });

  document.addEventListener("selectionchange", () => {
    if (slot === undefined || !root.contains(document.activeElement)) return;
    const caret = currentCaret(root);
    if (caret && isSlot(caret)) return;
    slot = undefined;
    if (caret) pending = caret;
    render(words);
  });

  return { render };
}

function inputFrom(event: InputEvent): Input | null {
  if (event.inputType === "insertText" && event.data) return { type: "insertText", text: event.data };
  return INPUT_TYPES[event.inputType] ?? null;
}

function paragraphs(words: ScriptWord[], slot: string | null | undefined): Node[] {
  const slotBefore = slot === undefined ? undefined : wordAfter(words, slot);
  const nodes = scriptLayout(words).map((lines) => {
    const paragraph = document.createElement("p");
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) paragraph.append(document.createElement("br"));
      line.forEach((word, position) => {
        if (position > 0) paragraph.append(" ");
        if (word.id === slotBefore) paragraph.append(slotElement(slot!), " ");
        const span = document.createElement("span");
        span.textContent = word.text;
        span.dataset.wordId = word.id;
        span.className = word.lowConfidence ? "word low-confidence" : "word";
        paragraph.append(span);
      });
    });
    return paragraph;
  });
  if (slot !== undefined && slotBefore === null) {
    const last = nodes.at(-1) ?? nodes[nodes.push(document.createElement("p")) - 1];
    last.append(" ", slotElement(slot));
  }
  return nodes;
}

function wordAfter(words: ScriptWord[], id: string | null) {
  const index = id === null ? 0 : words.findIndex((word) => word.id === id) + 1;
  return words[index]?.id ?? null;
}

function slotElement(after: string | null) {
  const span = document.createElement("span");
  span.className = "slot";
  span.dataset.slotAfter = after ?? "";
  span.textContent = SLOT_TEXT;
  return span;
}

function selectedRange(root: HTMLElement) {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const start = caretAt(root, range.startContainer, range.startOffset);
  const end = caretAt(root, range.endContainer, range.endOffset);
  return start && end ? { start, end } : null;
}

function currentCaret(root: HTMLElement) {
  const selection = document.getSelection();
  if (!selection?.focusNode) return null;
  return caretAt(root, selection.focusNode, selection.focusOffset);
}

function caretAt(root: HTMLElement, node: Node, offset: number): Caret | null {
  if (!root.contains(node)) return null;
  const element = node instanceof Text ? node.parentElement : (node as Element);
  if (element instanceof HTMLElement && element.dataset.slotAfter !== undefined) {
    return { slotAfter: element.dataset.slotAfter || null };
  }
  if (element instanceof HTMLElement && element.dataset.wordId) {
    const text = node instanceof Text ? node.data : element.textContent;
    const at = node instanceof Text ? offset : offset === 0 ? 0 : text.length;
    return { word: element.dataset.wordId, offset: chars(text.slice(0, at)).length };
  }
  const children = node instanceof Text ? [node] : Array.from(node.childNodes);
  const boundary = node instanceof Text ? (offset === 0 ? 0 : 1) : offset;
  const next = children.slice(boundary).map(wordSpanWithin).find(Boolean);
  if (next) return { word: next.dataset.wordId!, offset: 0 };
  const previous = children.slice(0, boundary).reverse().map(wordSpanWithin).find(Boolean);
  if (previous) return { word: previous.dataset.wordId!, offset: chars(previous.textContent).length };
  return { slotAfter: lastWordId(root) };
}

function wordSpanWithin(node: Node): HTMLElement | undefined {
  if (!(node instanceof HTMLElement)) return undefined;
  if (node.dataset.wordId) return node;
  return node.querySelector<HTMLElement>("[data-word-id]") ?? undefined;
}

function lastWordId(root: HTMLElement) {
  const spans = root.querySelectorAll<HTMLElement>("[data-word-id]");
  return spans.length ? spans[spans.length - 1].dataset.wordId! : null;
}

function placeCaret(root: HTMLElement, caret: Caret) {
  const target = isSlot(caret)
    ? root.querySelector(`[data-slot-after="${caret.slotAfter ?? ""}"]`)
    : root.querySelector(`[data-word-id="${caret.word}"]`);
  const text = target?.firstChild;
  if (!(text instanceof Text)) return;
  const offset = isSlot(caret) ? text.length : chars(text.data).slice(0, caret.offset).join("").length;
  document.getSelection()?.setBaseAndExtent(text, offset, text, offset);
  root.focus();
}
