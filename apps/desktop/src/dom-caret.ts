import { chars, isSlot, type Caret, type Range } from "./caret";

/** The pane's selection as Carets, or null when it is not in the pane. */
export function selectedRange(root: HTMLElement): Range | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const start = caretAt(root, range.startContainer, range.startOffset);
  const end = caretAt(root, range.endContainer, range.endOffset);
  return start && end ? { start, end } : null;
}

export function currentCaret(root: HTMLElement): Caret | null {
  const selection = document.getSelection();
  if (!selection?.focusNode) return null;
  return caretAt(root, selection.focusNode, selection.focusOffset);
}

export const placeCaret = (root: HTMLElement, caret: Caret) => placeRange(root, { start: caret, end: caret });

export function placeRange(root: HTMLElement, { start, end }: Range) {
  const from = domPosition(root, start);
  const to = domPosition(root, end);
  if (!from || !to) return;
  document.getSelection()?.setBaseAndExtent(from.text, from.offset, to.text, to.offset);
  root.focus();
}

function domPosition(root: HTMLElement, caret: Caret) {
  const text = elementFor(root, caret)?.firstChild;
  if (!(text instanceof Text)) return null;
  const offset = isSlot(caret) ? text.length : chars(text.data).slice(0, caret.offset).join("").length;
  return { text, offset };
}

function elementFor(root: HTMLElement, caret: Caret) {
  return isSlot(caret)
    ? root.querySelector(`[data-slot-after="${caret.slotAfter ?? ""}"]`)
    : root.querySelector(`[data-word-id="${caret.word}"]`);
}

/**
 * Maps a DOM position to a Caret: inside a Word or slot span, or at the nearest Word boundary.
 * A position inside an event chip or a Pending Passage counts as the boundary before it.
 */
function caretAt(root: HTMLElement, node: Node, offset: number): Caret | null {
  if (!root.contains(node)) return null;
  const element = node instanceof Text ? node.parentElement : (node as Element);
  const chip = element?.closest("[data-event-id], [data-recording-id]");
  if (chip?.parentNode && root.contains(chip)) {
    return caretAt(root, chip.parentNode, Array.from(chip.parentNode.childNodes).indexOf(chip));
  }
  if (element instanceof HTMLElement && element.dataset.slotAfter !== undefined) {
    return { slotAfter: element.dataset.slotAfter || null };
  }
  if (element instanceof HTMLElement && element.dataset.wordId) {
    const text = node instanceof Text ? node.data : element.textContent;
    const at = node instanceof Text ? offset : offset === 0 ? 0 : text.length;
    return { word: element.dataset.wordId, offset: chars(text.slice(0, at)).length };
  }
  const parent = node instanceof Text ? node.parentNode! : node;
  const children = Array.from(parent.childNodes);
  const boundary = node instanceof Text ? children.indexOf(node) + (offset === 0 ? 0 : 1) : offset;
  const next = children.slice(boundary).map(wordSpanWithin).find(Boolean);
  const previous = children.slice(0, boundary).reverse().map(wordSpanWithin).find(Boolean);
  const leansBack = node instanceof Text && offset === 0;
  if (previous && (leansBack || !next)) return { word: previous.dataset.wordId!, offset: chars(previous.textContent).length };
  if (next) return { word: next.dataset.wordId!, offset: 0 };
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
