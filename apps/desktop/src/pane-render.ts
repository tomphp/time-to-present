import { indexOf, type Slot } from "./caret";
import { scriptLayout } from "./script-view";
import type { ScriptWord } from "./session";

export const SLOT_TEXT = "​";

/** Renders the Script as paragraphs of Word spans, with the open slot (if any) where a typed Word would go. */
export function renderScript(root: HTMLElement, words: ScriptWord[], slot: Slot | null) {
  const slotBeforeWord = slot && words[indexOf(words, slot.slotAfter) + 1]?.id;
  const paragraphs = scriptLayout(words).map((lines) => {
    const paragraph = document.createElement("p");
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) paragraph.append(document.createElement("br"));
      line.forEach((word, position) => {
        if (position > 0) paragraph.append(" ");
        if (slot && word.id === slotBeforeWord) paragraph.append(slotElement(slot), " ");
        paragraph.append(wordElement(word.id, word.text, word.lowConfidence));
      });
    });
    return paragraph;
  });
  if (slot && !slotBeforeWord) {
    if (paragraphs.length === 0) paragraphs.push(document.createElement("p"));
    paragraphs[paragraphs.length - 1].append(" ", slotElement(slot));
  }
  root.replaceChildren(...paragraphs);
}

function wordElement(id: string, text: string, lowConfidence: boolean) {
  const span = document.createElement("span");
  span.textContent = text;
  span.dataset.wordId = id;
  span.className = lowConfidence ? "word low-confidence" : "word";
  return span;
}

function slotElement(slot: Slot) {
  const span = document.createElement("span");
  span.className = "slot";
  span.dataset.slotAfter = slot.slotAfter ?? "";
  span.textContent = SLOT_TEXT;
  return span;
}
