import type { NamedEvent, ScriptWord } from "./protocol";

export type Direction = "back" | "forward";

const SENTENCE_GRACE_MS = 1000;

const endsSentence = (word: ScriptWord) => /[.?!]$/.test(word.text) || word.breakAfter !== undefined;

const startsAfter = (words: ScriptWord[], ends: (word: ScriptWord) => boolean) =>
  words.filter((_, index) => index === 0 || ends(words[index - 1])).map((word) => word.start);

const nearest = (times: number[], from: number, direction: Direction) =>
  direction === "back" ? times.filter((time) => time < from).at(-1) : times.find((time) => time > from);

/** Where the Teleprompter's seek keys land from a Script Time: always a Word start or a Named Event's Script Time. */
export function seekTargets(words: ScriptWord[], namedEvents: NamedEvent[]) {
  const wordStarts = words.map((word) => word.start);
  const eventTimes = namedEvents.map((event) => event.scriptTime);
  const sentenceStarts = startsAfter(words, endsSentence);
  const paragraphStarts = startsAfter(words, (word) => word.breakAfter === "paragraph");

  return {
    /** The start of the current Sentence, or of the previous one if within 1 s of its start. */
    sentenceBack(from: number) {
      const current = sentenceStarts.filter((start) => start <= from).at(-1);
      if (current === undefined || from - current >= SENTENCE_GRACE_MS) return current;
      return nearest(sentenceStarts, current, "back") ?? current;
    },
    word: (from: number, direction: Direction) => nearest(wordStarts, from, direction),
    namedEvent: (from: number, direction: Direction) => nearest(eventTimes, from, direction),
    paragraph: (from: number, direction: Direction) => nearest(paragraphStarts, from, direction),
  };
}
