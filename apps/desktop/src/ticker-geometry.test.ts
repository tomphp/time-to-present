import { describe, expect, it } from "vitest";
import { rehearsal } from "./recorded-rehearsal";
import { scriptWord } from "./test-words";
import { freeScrollBounds, stripX, tickerGeometry } from "./ticker-geometry";
import type { ScriptWord } from "./session";

const CHAR = 10;
const SPACE = 10;
const measure = (words: ScriptWord[], char = CHAR) =>
  words.map(({ start, text }) => ({ start, textWidth: text.length * char }));

const { words, scriptEnd, namedEvents } = rehearsal.state;
const ticker = tickerGeometry(measure(words), scriptEnd, SPACE);
const edges = (placed = ticker) => placed.words.map(({ left, width }) => ({ left, width }));

describe("the rehearsal on the Ticker", () => {
  it("scales the median slot of 400 ms to the median Word and space of 60 px", () => {
    expect(ticker.scale).toBe(0.15);
  });

  it("gives each Word its slot at the scale, never narrower than its text and a space", () => {
    expect(edges()).toEqual([
      { left: 0, width: 60 },
      { left: 60, width: 90 },
      { left: 150, width: 165 },
      { left: 315, width: 60 },
      { left: 375, width: 37.5 },
      { left: 412.5, width: 240 },
      { left: 652.5, width: 50 },
      { left: 702.5, width: 30 },
      { left: 732.5, width: 140 },
    ]);
    expect(ticker.end).toBe(872.5);
  });

  it("gives a median slot exactly its text width and a space", () => {
    const today = words.findIndex(({ text }) => text === "Today");
    expect(ticker.words[today].width).toBe("Today".length * CHAR + SPACE);
  });

  it("gives fast Words the floor width so that no Word overlaps the next", () => {
    const morning = words.findIndex(({ text }) => text === "morning,");
    expect(ticker.words[morning].width).toBe("morning,".length * CHAR + SPACE);
    const lefts = [...words.map(({ start }) => stripX(ticker, start)), stripX(ticker, scriptEnd)];
    words.forEach(({ text }, index) => {
      expect(lefts[index + 1] - lefts[index]).toBeGreaterThanOrEqual(text.length * CHAR + SPACE);
    });
  });

  it("opens a long pause up as proportionally wider space", () => {
    const everyone = words.findIndex(({ text }) => text === "everyone.");
    expect(ticker.words[everyone].width).toBe(1_100 * 0.15);
  });

  it("brings each Word's left edge to the Read Mark exactly at its start", () => {
    expect(words.map(({ start }) => stripX(ticker, start))).toEqual([0, 60, 150, 315, 375, 412.5, 652.5, 702.5, 732.5]);
  });

  it.each([
    [700, 30],
    [1_150, 60 + 90 / 2],
    [1_400 + 1_100 / 4, 150 + 165 / 4],
    [3_150 + 800, 412.5 + 120],
    [5_849, 732.5 + (599 / 600) * 140],
  ])("moves linearly between starts: at %s ms the strip is at %s px", (t, x) => {
    expect(stripX(ticker, t)).toBeCloseTo(x);
  });

  it.each([
    [0, -75],
    [250, -37.5],
    [499, -0.15],
  ])("brings the first Word in at the scale during the lead-in: at %s ms the strip is at %s px", (t, x) => {
    expect(stripX(ticker, t)).toBeCloseTo(x);
  });

  it("reaches END at Script End and holds it after", () => {
    expect(stripX(ticker, scriptEnd)).toBe(872.5);
    expect(stripX(ticker, scriptEnd + 10_000)).toBe(872.5);
  });

  it("sits each Named Event's tick where the strip is at its time", () => {
    expect(namedEvents.map(({ time }) => stripX(ticker, time))).toEqual([-75, 315]);
    expect(stripX(ticker, scriptEnd + 500)).toBe(ticker.end);
  });

  it("free-scrolls from the first Word's left edge to END's", () => {
    expect(freeScrollBounds(ticker)).toEqual({ from: 0, to: 872.5 });
  });

  it("doubles the scale with the text widths, so every Word still reaches the Read Mark at its start", () => {
    const doubled = tickerGeometry(measure(words, CHAR * 2), scriptEnd, SPACE * 2);
    expect(doubled.scale).toBe(ticker.scale * 2);
    for (const t of [0, 500, 1_150, 2_500, 4_000, scriptEnd]) expect(stripX(doubled, t)).toBe(stripX(ticker, t) * 2);
  });
});

describe("edge cases", () => {
  it("places nothing when there are no Words, with END held at 0", () => {
    const empty = tickerGeometry([], 1_000, SPACE);
    expect(empty).toMatchObject({ words: [], end: 0, scale: 0 });
    expect([0, 500, 1_000].map((t) => stripX(empty, t))).toEqual([0, 0, 0]);
    expect(freeScrollBounds(empty)).toEqual({ from: 0, to: 0 });
  });

  it("scales one Word's slot to its own floor", () => {
    const one = tickerGeometry(measure([scriptWord("w1", "Hello", { start: 200 })]), 1_200, SPACE);
    expect(one.scale).toBe(0.06);
    expect(edges(one)).toEqual([{ left: 0, width: 60 }]);
    expect([0, 200, 700, 1_200].map((t) => stripX(one, t))).toEqual([-12, 0, 30, 60]);
  });

  it("leaves one Word at Script End at its floor with no scale", () => {
    const one = tickerGeometry(measure([scriptWord("w1", "Hello", { start: 1_000 })]), 1_000, SPACE);
    expect(one.scale).toBe(0);
    expect(edges(one)).toEqual([{ left: 0, width: 60 }]);
    expect([0, 999, 1_000].map((t) => stripX(one, t))).toEqual([0, 0, 60]);
  });

  it("passes zero-duration slots in an instant", () => {
    const stacked = tickerGeometry(
      measure([
        scriptWord("w1", "One", { start: 0 }),
        scriptWord("w2", "two", { start: 400 }),
        scriptWord("w3", "six", { start: 400 }),
        scriptWord("w4", "four", { start: 800 }),
      ]),
      1_200,
      SPACE,
    );
    expect(stacked.scale).toBe(0.1);
    expect(edges(stacked)).toEqual([
      { left: 0, width: 40 },
      { left: 40, width: 40 },
      { left: 80, width: 40 },
      { left: 120, width: 50 },
    ]);
    expect([200, 400, 600].map((t) => stripX(stacked, t))).toEqual([20, 80, 100]);
  });

  it("brings Words that start together in during the lead-in, then passes all but the last in an instant", () => {
    const together = tickerGeometry(
      measure([scriptWord("w1", "Go", { start: 500 }), scriptWord("w2", "up", { start: 500 })]),
      1_000,
      SPACE,
    );
    expect(together.scale).toBe(0.06);
    expect(edges(together)).toEqual([
      { left: 0, width: 30 },
      { left: 30, width: 30 },
    ]);
    expect([0, 499, 500, 750].map((t) => stripX(together, t))).toEqual([-30, -0.06, 30, 45]);
  });

  it("leaves every Word at its floor with no scale when all slots are zero-duration", () => {
    const stacked = tickerGeometry(
      measure([scriptWord("w1", "All", { start: 500 }), scriptWord("w2", "at", { start: 500 })]),
      500,
      SPACE,
    );
    expect(stacked.scale).toBe(0);
    expect(edges(stacked)).toEqual([
      { left: 0, width: 40 },
      { left: 40, width: 30 },
    ]);
    expect([0, 500].map((t) => stripX(stacked, t))).toEqual([0, 70]);
  });

  it("gives a last Word past Script End its floor and reaches END at Script End", () => {
    const late = tickerGeometry(
      measure([scriptWord("w1", "Early", { start: 0 }), scriptWord("w2", "later", { start: 1_500 })]),
      1_000,
      SPACE,
    );
    expect(late.scale).toBe(0.04);
    expect(edges(late)).toEqual([
      { left: 0, width: 60 },
      { left: 60, width: 60 },
    ]);
    expect([750, 1_000, 2_000].map((t) => stripX(late, t))).toEqual([30, 120, 120]);
  });
});
