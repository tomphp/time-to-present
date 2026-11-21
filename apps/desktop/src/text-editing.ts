import { chars, indexAfter, indexOf, isSlot, sameCaret, type Caret, type CaretTarget, type Range } from "./caret";
import type { BreakAfter, Edit, ScriptWord } from "./session";

export type { Caret, CaretTarget, Range } from "./caret";
export { resolveCaret } from "./caret";

export type Input =
  | { type: "insertText"; text: string }
  | { type: "deleteBackward" }
  | { type: "deleteForward" }
  | { type: "insertBreak" };

export interface Outcome {
  edit?: Edit;
  caret: CaretTarget;
}

/** Turns what was typed at a selection into the Session edit it means, or null for nothing. */
export function applyInput(words: ScriptWord[], range: Range, input: Input): Outcome | null {
  if (!sameCaret(range.start, range.end)) return applyToSelection(words, range, input);
  const caret = range.start;
  switch (input.type) {
    case "insertText":
      return input.text === " " ? space(words, caret) : typeText(words, caret, input.text);
    case "deleteBackward":
      return deleteBackward(words, caret);
    case "deleteForward":
      return deleteForward(words, caret);
    case "insertBreak":
      return insertBreak(words, caret);
  }
}

function applyToSelection(words: ScriptWord[], { start, end }: Range, input: Input): Outcome | null {
  if (!isSlot(start) && !isSlot(end) && start.word === end.word) {
    const replacement = input.type === "insertText" && input.text !== " " ? input.text : "";
    if (input.type === "insertBreak" || /\s/.test(replacement)) return null;
    return replaceText(words, start.word, start.offset, end.offset, replacement);
  }
  if (input.type === "insertBreak") return null;
  const first = indexAfter(words, start);
  const last = isSlot(end) ? indexOf(words, end.slotAfter) : indexOf(words, end.word);
  if (first > last) return null;
  return {
    edit: { kind: "delete", words: words.slice(first, last + 1).map((word) => word.id) },
    caret: { wordAfter: words[first - 1]?.id ?? null, offset: 0 },
  };
}

function typeText(words: ScriptWord[], caret: Caret, text: string): Outcome | null {
  if (/\s/.test(text)) return null;
  if (isSlot(caret)) {
    return {
      edit: { kind: "insertWord", after: caret.slotAfter, text },
      caret: { wordAfter: caret.slotAfter, offset: chars(text).length },
    };
  }
  return replaceText(words, caret.word, caret.offset, caret.offset, text);
}

function space(words: ScriptWord[], caret: Caret): Outcome | null {
  if (isSlot(caret)) return null;
  const index = indexOf(words, caret.word);
  if (caret.offset === 0) return { caret: { slotAfter: words[index - 1]?.id ?? null } };
  if (caret.offset >= chars(words[index].text).length) return { caret: { slotAfter: caret.word } };
  return { edit: { kind: "split", word: caret.word, at: caret.offset }, caret: { wordAfter: caret.word, offset: 0 } };
}

function deleteBackward(words: ScriptWord[], caret: Caret): Outcome | null {
  if (isSlot(caret)) return caret.slotAfter === null ? null : { caret: endOf(words, indexOf(words, caret.slotAfter)) };
  if (caret.offset > 0) return replaceText(words, caret.word, caret.offset - 1, caret.offset, "");
  const previous = words[indexOf(words, caret.word) - 1];
  if (!previous) return null;
  if (previous.breakAfter) return { edit: setBreak(previous, previousBreak(previous.breakAfter)), caret };
  return { edit: { kind: "merge", word: previous.id }, caret: endOf(words, indexOf(words, previous.id)) };
}

function deleteForward(words: ScriptWord[], caret: Caret): Outcome | null {
  if (isSlot(caret)) return null;
  const index = indexOf(words, caret.word);
  const word = words[index];
  if (caret.offset < chars(word.text).length) return replaceText(words, word.id, caret.offset, caret.offset + 1, "");
  if (!words[index + 1]) return null;
  if (word.breakAfter) return { edit: setBreak(word, previousBreak(word.breakAfter)), caret };
  return { edit: { kind: "merge", word: word.id }, caret };
}

function insertBreak(words: ScriptWord[], caret: Caret): Outcome | null {
  const index = isSlot(caret) ? indexOf(words, caret.slotAfter) : indexOf(words, caret.word) - (caret.offset === 0 ? 1 : 0);
  const word = words[index];
  if (!word) return null;
  const target = { slotAfter: word.id };
  if (word.breakAfter === "paragraph") return { caret: target };
  return { edit: setBreak(word, nextBreak(word.breakAfter)), caret: target };
}

function replaceText(words: ScriptWord[], id: string, from: number, to: number, replacement: string): Outcome {
  const text = chars(words[indexOf(words, id)].text);
  const edited = [...text.slice(0, from), ...chars(replacement), ...text.slice(to)].join("");
  if (edited === "") return { edit: { kind: "delete", words: [id] }, caret: endOf(words, indexOf(words, id) - 1) };
  return { edit: { kind: "correct", word: id, text: edited }, caret: { word: id, offset: from + chars(replacement).length } };
}

const endOf = (words: ScriptWord[], index: number): Caret =>
  index < 0 ? { slotAfter: null } : { word: words[index].id, offset: chars(words[index].text).length };

const setBreak = (word: ScriptWord, breakAfter: BreakAfter | null): Edit => ({ kind: "setBreak", word: word.id, breakAfter });

const nextBreak = (current?: BreakAfter): BreakAfter => (current === "line" ? "paragraph" : "line");

const previousBreak = (current: BreakAfter): BreakAfter | null => (current === "paragraph" ? "line" : null);
