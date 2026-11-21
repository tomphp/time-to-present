import { describe, expect, it } from "vitest";
import {
  confirmsHome,
  navigation,
  type KeyPress,
  eventBack,
  eventForward,
  paragraphBack,
  paragraphForward,
  sentenceBack,
  stepSpeed,
  wordBack,
  wordForward,
} from "./teleprompter-seek";
import { scriptWord } from "./test-words";

const words = [
  scriptWord("a", "Hello", { start: 0 }),
  scriptWord("b", "there.", { start: 500 }),
  scriptWord("c", "How", { start: 2_000 }),
  scriptWord("d", "are", { start: 2_500 }),
  scriptWord("e", "you", { start: 3_000, breakAfter: "paragraph" }),
  scriptWord("f", "Fine!", { start: 5_000 }),
  scriptWord("g", "Thanks", { start: 6_000 }),
];

describe("Sentence back", () => {
  it("goes to the start of the current Sentence", () => {
    expect(sentenceBack(words, 3_500)).toBe(2_000);
    expect(sentenceBack(words, 7_100)).toBe(6_000);
  });

  it("goes to the previous Sentence within 1 s of the start", () => {
    expect(sentenceBack(words, 2_400)).toBe(0);
    expect(sentenceBack(words, 5_000)).toBe(2_000);
  });

  it("treats any breakAfter as the end of a Sentence", () => {
    expect(sentenceBack(words, 5_900)).toBe(2_000);
  });

  it("ends a Sentence on ? and ! and through closing quotes", () => {
    const spoken = [
      scriptWord("a", "Really?", { start: 0 }),
      scriptWord("b", "“Yes!”", { start: 2_000 }),
      scriptWord("c", "Fine", { start: 4_000 }),
    ];
    expect(sentenceBack(spoken, 5_500)).toBe(4_000);
    expect(sentenceBack(spoken, 4_500)).toBe(2_000);
    expect(sentenceBack(spoken, 3_000)).toBe(2_000);
  });

  it("restarts the current Sentence at exactly 1 s from its start", () => {
    expect(sentenceBack(words, 3_000)).toBe(2_000);
    expect(sentenceBack(words, 2_999)).toBe(0);
  });

  it("stays at the start of the Script", () => {
    expect(sentenceBack(words, 300)).toBe(0);
    expect(sentenceBack([], 300)).toBe(0);
  });
});

describe("seeking by Word", () => {
  it("lands on the previous or next Word start", () => {
    expect(wordBack(words, 2_600)).toBe(2_500);
    expect(wordBack(words, 2_500)).toBe(2_000);
    expect(wordForward(words, 2_600)).toBe(3_000);
    expect(wordForward(words, 2_500)).toBe(3_000);
  });

  it("stays put at either end", () => {
    expect(wordBack(words, 0)).toBe(0);
    expect(wordForward(words, 6_000)).toBe(6_000);
  });
});

describe("seeking by Named Event", () => {
  const events = [{ time: 4_000 }, { time: 1_000 }];

  it("lands on the previous or next event's Script Time", () => {
    expect(eventForward(events, 0)).toBe(1_000);
    expect(eventForward(events, 1_000)).toBe(4_000);
    expect(eventBack(events, 4_000)).toBe(1_000);
  });

  it("stays put with no event that way", () => {
    expect(eventBack(events, 500)).toBe(500);
    expect(eventForward(events, 4_500)).toBe(4_500);
  });
});

describe("seeking by paragraph", () => {
  it("lands on paragraph starts", () => {
    expect(paragraphForward(words, 0)).toBe(5_000);
    expect(paragraphBack(words, 6_500)).toBe(5_000);
    expect(paragraphBack(words, 5_000)).toBe(0);
  });

  it("stays put past the last paragraph", () => {
    expect(paragraphForward(words, 6_500)).toBe(6_500);
  });
});

describe("speed", () => {
  it("steps by 0.05 within 0.5–2.0×", () => {
    expect(stepSpeed(1, 1)).toBe(1.05);
    expect(stepSpeed(1.1, -1)).toBe(1.05);
    expect(stepSpeed(2, 1)).toBe(2);
    expect(stepSpeed(0.5, -1)).toBe(0.5);
  });
});

describe("Home", () => {
  it("needs a second press within 2 s", () => {
    expect(confirmsHome(null, 5_000)).toBe(false);
    expect(confirmsHome(1_000, 3_000)).toBe(true);
    expect(confirmsHome(1_000, 3_001)).toBe(false);
  });
});

describe("the navigation keymap", () => {
  const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({
    key,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    ...modifiers,
  });
  const position = { words, events: [{ time: 1_000 }], scriptTime: 2_600, speed: 1 };
  const keyed = (key: KeyPress, armedHome: number | null = null, now = 0) => navigation(key, position, armedHome, now);

  it("seeks by Sentence, Word, Named Event and paragraph", () => {
    expect(keyed(press("PageUp"))).toEqual({ seek: 0 });
    expect(keyed(press("ArrowLeft"))).toEqual({ seek: 0 });
    expect(keyed(press("ArrowLeft", { altKey: true }))).toEqual({ seek: 2_500 });
    expect(keyed(press("ArrowRight", { altKey: true }))).toEqual({ seek: 3_000 });
    expect(keyed(press("ArrowLeft", { shiftKey: true }))).toEqual({ seek: 1_000 });
    expect(keyed(press("ArrowRight", { shiftKey: true }))).toEqual({ seek: 2_600 });
    expect(keyed(press("["))).toEqual({ seek: 0 });
    expect(keyed(press("]"))).toEqual({ seek: 5_000 });
  });

  it("changes speed with ↑ ↓ and resets it with 0", () => {
    expect(keyed(press("ArrowUp"))).toEqual({ speed: 1.05 });
    expect(keyed(press("ArrowDown"))).toEqual({ speed: 0.95 });
    expect(navigation(press("0"), { ...position, speed: 1.3 }, null, 0)).toEqual({ speed: 1 });
  });

  it("goes back to start on a second Home within 2 s", () => {
    expect(keyed(press("Home"), null, 5_000)).toBe("armHome");
    expect(keyed(press("Home"), 5_000, 6_000)).toBe("reset");
    expect(keyed(press("Home"), 5_000, 7_500)).toBe("armHome");
  });

  it("ignores other keys and ⌘ or ⌃ chords", () => {
    expect(keyed(press("a"))).toBeNull();
    expect(keyed(press("ArrowUp", { altKey: true }))).toBeNull();
    expect(keyed(press("ArrowUp", { metaKey: true }))).toBeNull();
  });
});
