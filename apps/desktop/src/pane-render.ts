import { indexOf, type Slot } from "./caret";
import { chipsByAnchor } from "./named-events";
import { scriptLayout } from "./script-view";
import { SCRIPT_START, type ScriptWord, type TimedEvent } from "./session";

export const SLOT_TEXT = "​";

export interface Chips {
  events: TimedEvent[];
  moved: string[];
  selected: string | null;
}

const NO_CHIPS: Chips = { events: [], moved: [], selected: null };

/**
 * Renders the Script as paragraphs of Word spans, each after the chips of the Named Events
 * anchored to it, with the open slot (if any) where a typed Word would go.
 */
export function renderScript(root: HTMLElement, words: ScriptWord[], slot: Slot | null, chips = NO_CHIPS) {
  const slotBeforeWord = slot && words[indexOf(words, slot.slotAfter) + 1]?.id;
  const byAnchor = chipsByAnchor(chips.events);
  const chipsFor = (anchor: string) => (byAnchor.get(anchor) ?? []).map((event) => chipElement(event, chips));
  const paragraphs = scriptLayout(words).map((lines) => {
    const paragraph = document.createElement("p");
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) paragraph.append(document.createElement("br"));
      line.forEach((word, position) => {
        if (position > 0) paragraph.append(" ");
        if (slot && word.id === slotBeforeWord) paragraph.append(slotElement(slot), " ");
        paragraph.append(...chipsFor(word.id), wordElement(word.id, word.text, word.lowConfidence));
      });
    });
    return paragraph;
  });
  if (paragraphs.length === 0 && (slot || byAnchor.has(SCRIPT_START))) paragraphs.push(document.createElement("p"));
  paragraphs[0]?.prepend(...chipsFor(SCRIPT_START));
  if (slot && !slotBeforeWord) paragraphs[paragraphs.length - 1].append(" ", slotElement(slot));
  root.replaceChildren(...paragraphs);
}

function chipElement(event: TimedEvent, { moved, selected }: Chips) {
  const span = document.createElement("span");
  span.className = ["event-chip", moved.includes(event.id) && "moved", event.id === selected && "selected"]
    .filter(Boolean)
    .join(" ");
  span.contentEditable = "false";
  span.dataset.eventId = event.id;
  span.textContent = event.name;
  return span;
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
