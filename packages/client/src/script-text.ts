import type { NamedEvent, ScriptWord } from "./protocol.js";
import type { ResolvedScript } from "./presentation-script.js";

const separatorAfter = (word: ScriptWord) => ({ line: "\n", paragraph: "\n\n", none: " " })[word.breakAfter ?? "none"];
const endLine = (text: string) => (text ? `${text}\n` : "");

function prose(words: ScriptWord[], textOf: (word: ScriptWord) => string) {
  return words.map((word, i) => textOf(word) + (i < words.length - 1 ? separatorAfter(word) : "")).join("");
}

/** The Named Event's name and, unless null, its data as compact JSON, joined by `separator`. */
export const nameAndData = ({ name, data }: NamedEvent, separator: string) =>
  data === null ? name : `${name}${separator}${JSON.stringify(data)}`;

const marker = (event: NamedEvent) => `[${nameAndData(event, " ")}]`;

/** The Script Text: the Words as plain prose, a new line at a line break and a blank line at a paragraph break. */
export function scriptText({ words }: ResolvedScript): string {
  return endLine(prose(words, (word) => word.text));
}

/** The Script Text with each Named Event's `[name data]` marker just before its anchor Word, or at the very start. */
export function scriptTextWithEvents({ words, namedEvents, anchorOf }: ResolvedScript): string {
  const markersAt = new Map<ScriptWord | null, string[]>();
  for (const event of namedEvents) {
    const anchor = anchorOf(event);
    markersAt.set(anchor, [...(markersAt.get(anchor) ?? []), marker(event)]);
  }
  const marked = prose(words, (word) => [...(markersAt.get(word) ?? []), word.text].join(" "));
  return endLine([...(markersAt.get(null) ?? []), marked].filter(Boolean).join(" "));
}
