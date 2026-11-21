import { indexOf, isSlot, type Caret } from "./caret";
import { SCRIPT_START, type Edit, type ScriptWord, type TimedEvent } from "./session";

export interface EventAt {
  anchor: string;
  offset: number;
}

/** What the event editor is open on: a new event at the caret, or one already in the Script. */
export type EventDraft = { kind: "new"; at: EventAt } | { kind: "existing"; event: TimedEvent };

/**
 * Where ⌘E puts a new event: at the Script start when the caret is there, otherwise on the
 * next Word, or at the last Word's end when none follows.
 */
export function eventAnchorAt(words: ScriptWord[], caret: Caret): EventAt {
  const next = isSlot(caret)
    ? indexOf(words, caret.slotAfter) + 1
    : indexOf(words, caret.word) + (caret.offset === 0 ? 0 : 1);
  if (next === 0) return { anchor: SCRIPT_START, offset: 0 };
  const word = words[next];
  if (word) return { anchor: word.id, offset: 0 };
  const last = words[next - 1];
  return { anchor: last.id, offset: last.duration };
}

export const eventNames = (events: TimedEvent[]) => [...new Set(events.map((event) => event.name))].sort();

/** The name already used that what was typed is the start of, unless it is a name already. */
export function completeName(names: string[], typed: string): string | null {
  if (!typed || names.includes(typed)) return null;
  return names.find((name) => name.startsWith(typed)) ?? null;
}

export function parseEventData(text: string): { data: unknown } | { error: string } {
  if (!text.trim()) return { data: undefined };
  try {
    return { data: JSON.parse(text) };
  } catch (error) {
    return { error: `Data is not valid JSON: ${(error as Error).message}` };
  }
}

/** The edit the event editor's fields make, once the name is given and the data is JSON. */
export function eventEdit(draft: EventDraft, name: string, dataText: string): { edit: Edit } | { error: string } {
  const trimmed = name.trim();
  if (!trimmed) return { error: "A Named Event needs a name" };
  const parsed = parseEventData(dataText);
  if ("error" in parsed) return parsed;
  const { data } = parsed;
  return draft.kind === "new"
    ? { edit: { kind: "insertEvent", ...draft.at, name: trimmed, data } }
    : { edit: { kind: "setEvent", event: draft.event.id, name: trimmed, data } };
}

const inScriptTime = (events: TimedEvent[]) => [...events].sort((a, b) => a.time - b.time);

/** The Moved event ⌘' jumps to: the first after the selected one in Script Time, wrapping round. */
export function nextMoved(events: TimedEvent[], moved: string[], selected: string | null): string | null {
  const ordered = inScriptTime(events);
  const from = ordered.findIndex((event) => event.id === selected) + 1;
  const after = [...ordered.slice(from), ...ordered.slice(0, from)];
  return after.find((event) => moved.includes(event.id))?.id ?? null;
}

/** The chips to show before each Word (or at the Script start), in Script Time order. */
export function chipsByAnchor(events: TimedEvent[]): Map<string, TimedEvent[]> {
  const chips = new Map<string, TimedEvent[]>();
  for (const event of inScriptTime(events)) {
    chips.set(event.anchor, [...(chips.get(event.anchor) ?? []), event]);
  }
  return chips;
}
