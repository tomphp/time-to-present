import { indexOf, type Slot } from "./caret";
import { liveTranscriptElement } from "./live-transcript";
import { chipsByAnchor } from "./named-events";
import { passagesByPosition, pendingElement } from "./pending-passage";
import { scriptLayout, type LaidOutWord } from "./script-view";
import { SCRIPT_START, type LiveTranscript, type PendingPassage, type ScriptWord, type TimedEvent } from "./session";

export const SLOT_TEXT = "​";

export interface Chips {
  events: TimedEvent[];
  moved: string[];
  selected: string | null;
}

const NO_CHIPS: Chips = { events: [], moved: [], selected: null };

/**
 * Renders the Script as paragraphs of Word spans, each after the chips of the Named Events
 * anchored to it and any Pending Passage waiting to land before it, then the Live Transcript
 * if it is there, with the open slot (if any) where a typed Word would go. The Words being
 * Re-recorded, or waiting for a pending Re-record to replace them, are struck through.
 */
export function renderScript(
  root: HTMLElement,
  words: ScriptWord[],
  slot: Slot | null,
  chips = NO_CHIPS,
  pending: PendingPassage[] = [],
  live: LiveTranscript | null = null,
  reRecording: string[] = [],
) {
  const struck = new Set([...reRecording, ...pending.flatMap((passage) => passage.replacing)]);
  const slotBeforeWord = slot && words[indexOf(words, slot.slotAfter) + 1]?.id;
  const byAnchor = chipsByAnchor(chips.events);
  const chipsFor = (anchor: string) => (byAnchor.get(anchor) ?? []).map((event) => chipElement(event, chips));
  const byPosition = passagesByPosition(words, pending);
  const liveAt = passagesByPosition(words, live ? [live] : []);
  const pendingBefore = (id: string | null) => [
    ...(byPosition.get(id) ?? []).flatMap((passage) => [pendingElement(passage), " "]),
    ...(liveAt.get(id) ?? []).flatMap((transcript) => [liveTranscriptElement(transcript), " "]),
  ];
  const paragraphs = scriptLayout(words).map((lines) => {
    const paragraph = document.createElement("p");
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) paragraph.append(document.createElement("br"));
      line.forEach((word, position) => {
        if (position > 0) paragraph.append(" ");
        paragraph.append(...pendingBefore(word.id));
        if (slot && word.id === slotBeforeWord) paragraph.append(slotElement(slot), " ");
        paragraph.append(...chipsFor(word.id), wordElement(word, struck.has(word.id)));
      });
    });
    return paragraph;
  });
  const atEnd = pendingBefore(null).slice(0, -1);
  if (paragraphs.length === 0 && (slot || byAnchor.has(SCRIPT_START) || atEnd.length)) paragraphs.push(document.createElement("p"));
  paragraphs[0]?.prepend(...chipsFor(SCRIPT_START));
  const last = paragraphs[paragraphs.length - 1];
  if (atEnd.length) last.append(...(words.length ? [" ", ...atEnd] : atEnd));
  if (slot && !slotBeforeWord) last.append(" ", slotElement(slot));
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

function wordElement({ id, text, lowConfidence }: LaidOutWord, struck: boolean) {
  const span = document.createElement("span");
  span.textContent = text;
  span.dataset.wordId = id;
  span.className = ["word", lowConfidence && "low-confidence", struck && "re-recorded"].filter(Boolean).join(" ");
  return span;
}

function slotElement(slot: Slot) {
  const span = document.createElement("span");
  span.className = "slot";
  span.dataset.slotAfter = slot.slotAfter ?? "";
  span.textContent = SLOT_TEXT;
  return span;
}
