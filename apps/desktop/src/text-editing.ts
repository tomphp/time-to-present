import { chars, collapsed, endOf, indexOf, isSlot, sameCaret, type Caret, type CaretTarget, type Range } from "./caret";
import type { BreakAfter, Edit, ScriptWord } from "./session";
import { replaceSelection } from "./selection-editing";

export type Input =
  | { type: "insertText"; text: string }
  | { type: "deleteBackward" }
  | { type: "deleteForward" }
  | { type: "deleteWordBackward" }
  | { type: "deleteWordForward" }
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
    case "deleteWordBackward":
      return isSlot(caret) || caret.offset === 0
        ? deleteBackward(words, caret)
        : replaceSelection(words, { start: { word: caret.word, offset: 0 }, end: caret }, "");
    case "deleteWordForward":
      return isSlot(caret) || caret.offset === textLength(words, caret.word)
        ? deleteForward(words, caret)
        : replaceSelection(words, { start: caret, end: endOf(words, indexOf(words, caret.word)) }, "");
    case "insertBreak":
      return insertBreak(words, caret);
  }
}

function applyToSelection(words: ScriptWord[], range: Range, input: Input): Outcome | null {
  switch (input.type) {
    case "insertBreak":
      return null;
    case "insertText":
      return input.text === " " ? spaceOverSelection(words, range) : replaceSelection(words, range, input.text);
    default:
      return replaceSelection(words, range, "");
  }
}

function spaceOverSelection(words: ScriptWord[], range: Range): Outcome | null {
  const removed = replaceSelection(words, range, "");
  const { start } = range;
  if (!removed?.edit || removed.edit.kind !== "correct" || isSlot(start)) return removed;
  if (start.offset === 0 || start.offset >= chars(removed.edit.text).length) return removed;
  return {
    edit: { kind: "batch", edits: [removed.edit, { kind: "split", word: start.word, at: start.offset }] },
    caret: { wordAfter: start.word, offset: 0 },
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
  return replaceSelection(words, collapsed(caret), text);
}

function space(words: ScriptWord[], caret: Caret): Outcome | null {
  if (isSlot(caret)) return null;
  const index = indexOf(words, caret.word);
  if (caret.offset === 0) return { caret: { slotAfter: words[index - 1]?.id ?? null } };
  if (caret.offset >= textLength(words, caret.word)) return { caret: { slotAfter: caret.word } };
  return { edit: { kind: "split", word: caret.word, at: caret.offset }, caret: { wordAfter: caret.word, offset: 0 } };
}

function deleteBackward(words: ScriptWord[], caret: Caret): Outcome | null {
  if (isSlot(caret)) return caret.slotAfter === null ? null : { caret: endOf(words, indexOf(words, caret.slotAfter)) };
  if (caret.offset > 0) {
    return replaceSelection(words, { start: { word: caret.word, offset: caret.offset - 1 }, end: caret }, "");
  }
  const previous = words[indexOf(words, caret.word) - 1];
  if (!previous) return null;
  if (previous.breakAfter) return removeBreak(previous, caret);
  return { edit: { kind: "merge", word: previous.id }, caret: endOf(words, indexOf(words, previous.id)) };
}

function deleteForward(words: ScriptWord[], caret: Caret): Outcome | null {
  if (isSlot(caret)) return null;
  const index = indexOf(words, caret.word);
  const word = words[index];
  if (caret.offset < chars(word.text).length) {
    return replaceSelection(words, { start: caret, end: { word: word.id, offset: caret.offset + 1 } }, "");
  }
  if (!words[index + 1]) return null;
  if (word.breakAfter) return removeBreak(word, caret);
  return { edit: { kind: "merge", word: word.id }, caret };
}

function insertBreak(words: ScriptWord[], caret: Caret): Outcome | null {
  if (!isSlot(caret) && caret.offset > 0 && caret.offset < textLength(words, caret.word)) {
    const word = words[indexOf(words, caret.word)];
    return {
      edit: { kind: "batch", edits: [{ kind: "split", word: word.id, at: caret.offset }, addBreak(word)] },
      caret: { wordAfter: word.id, offset: 0 },
    };
  }
  const index = isSlot(caret) ? indexOf(words, caret.slotAfter) : indexOf(words, caret.word) - (caret.offset === 0 ? 1 : 0);
  const word = words[index];
  if (!word) return null;
  const target = { slotAfter: word.id };
  if (word.breakAfter === "paragraph") return { caret: target };
  return { edit: addBreak(word), caret: target };
}

const textLength = (words: ScriptWord[], id: string) => chars(words[indexOf(words, id)].text).length;

const setBreak = (word: ScriptWord, breakAfter: BreakAfter | null): Edit => ({ kind: "setBreak", word: word.id, breakAfter });

/** Enter sets a line break, and a second Enter a paragraph break. */
const addBreak = (word: ScriptWord) => setBreak(word, word.breakAfter === "line" ? "paragraph" : "line");

/** Deleting across a break steps it back the way Enter set it. */
const removeBreak = (word: ScriptWord, caret: Caret): Outcome => ({
  edit: setBreak(word, word.breakAfter === "paragraph" ? "line" : null),
  caret,
});
