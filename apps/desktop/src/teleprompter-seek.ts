import type { ScriptWord, TimedEvent } from "./session";

export const SENTENCE_RESTART_WINDOW = 1_000;
export const HOME_CONFIRM_WINDOW = 2_000;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;
export const SPEED_STEP = 0.05;

type Timed = Pick<ScriptWord, "start" | "text" | "breakAfter">;

const endsSentence = ({ text, breakAfter }: Timed) => breakAfter !== undefined || /[.?!]$/.test(text);
const endsParagraph = ({ breakAfter }: Timed) => breakAfter === "paragraph";

const lastBefore = (times: number[], scriptTime: number) => times.filter((time) => time < scriptTime).pop();
const firstAfter = (times: number[], scriptTime: number) => times.find((time) => time > scriptTime);

function startsAfter(words: Timed[], ends: (word: Timed) => boolean) {
  const starts = words.length > 0 ? [words[0].start] : [];
  words.forEach((word, index) => ends(word) && index + 1 < words.length && starts.push(words[index + 1].start));
  return starts;
}

/** PageUp/←: the start of the Sentence being spoken, or of the one before it when that start is within 1 s. */
export function sentenceBack(words: Timed[], scriptTime: number) {
  const starts = startsAfter(words, endsSentence);
  const current = lastBefore(starts, scriptTime + 1) ?? 0;
  if (scriptTime - current >= SENTENCE_RESTART_WINDOW) return current;
  return lastBefore(starts, current) ?? current;
}

export const wordBack = (words: Timed[], scriptTime: number) =>
  lastBefore(words.map((word) => word.start), scriptTime) ?? scriptTime;

export const wordForward = (words: Timed[], scriptTime: number) =>
  firstAfter(words.map((word) => word.start), scriptTime) ?? scriptTime;

export const eventBack = (events: Pick<TimedEvent, "time">[], scriptTime: number) =>
  lastBefore(events.map((event) => event.time).sort((a, b) => a - b), scriptTime) ?? scriptTime;

export const eventForward = (events: Pick<TimedEvent, "time">[], scriptTime: number) =>
  firstAfter(events.map((event) => event.time).sort((a, b) => a - b), scriptTime) ?? scriptTime;

export const paragraphBack = (words: Timed[], scriptTime: number) =>
  lastBefore(startsAfter(words, endsParagraph), scriptTime) ?? scriptTime;

export const paragraphForward = (words: Timed[], scriptTime: number) =>
  firstAfter(startsAfter(words, endsParagraph), scriptTime) ?? scriptTime;

export const stepSpeed = (speed: number, direction: 1 | -1) =>
  Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round((speed + direction * SPEED_STEP) * 100) / 100));

/** Home goes back to start only when pressed twice, the second within 2 s of the first. */
export const confirmsHome = (previous: number | null, now: number) =>
  previous !== null && now - previous <= HOME_CONFIRM_WINDOW;

export interface KeyPress {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export interface Position {
  words: Timed[];
  events: Pick<TimedEvent, "time">[];
  scriptTime: number;
  speed: number;
}

export type Navigation = { seek: number } | { speed: number } | "reset" | "armHome";

type Seek = (position: Position) => number;

const SEEKS: Record<string, Seek> = {
  PageUp: ({ words, scriptTime }) => sentenceBack(words, scriptTime),
  ArrowLeft: ({ words, scriptTime }) => sentenceBack(words, scriptTime),
  "alt+ArrowLeft": ({ words, scriptTime }) => wordBack(words, scriptTime),
  "alt+ArrowRight": ({ words, scriptTime }) => wordForward(words, scriptTime),
  "shift+ArrowLeft": ({ events, scriptTime }) => eventBack(events, scriptTime),
  "shift+ArrowRight": ({ events, scriptTime }) => eventForward(events, scriptTime),
  "[": ({ words, scriptTime }) => paragraphBack(words, scriptTime),
  "]": ({ words, scriptTime }) => paragraphForward(words, scriptTime),
};

/** What a key does to the clock beyond play/pause; `armedHome` is when Home was last pressed. */
export function navigation(
  { key, altKey, shiftKey, metaKey, ctrlKey }: KeyPress,
  position: Position,
  armedHome: number | null,
  now: number,
): Navigation | null {
  if (metaKey || ctrlKey) return null;
  const modifier = altKey ? "alt+" : shiftKey ? "shift+" : "";
  const seek = SEEKS[modifier + key];
  if (seek) return { seek: seek(position) };
  if (modifier) return null;
  if (key === "ArrowUp") return { speed: stepSpeed(position.speed, 1) };
  if (key === "ArrowDown") return { speed: stepSpeed(position.speed, -1) };
  if (key === "0") return { speed: 1 };
  if (key === "Home") return confirmsHome(armedHome, now) ? "reset" : "armHome";
  return null;
}
