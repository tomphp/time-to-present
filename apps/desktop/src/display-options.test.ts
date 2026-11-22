import { describe, expect, it } from "vitest";
import {
  applyAction,
  DEFAULT_OPTIONS,
  displayAction,
  isDisplayAction,
  isRepeatable,
  loadOptions,
  markerPlacements,
  mirrorFor,
  mirrorTransform,
  saveOptions,
} from "./display-options";

const press = (key: string, modifiers: object = {}) =>
  displayAction({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...modifiers });

describe("display keys", () => {
  it("maps B and . to blank, E to markers, M to mirror and ⇧M to a vertical flip", () => {
    expect([press("b"), press("."), press("e"), press("m")]).toEqual(["blank", "blank", "markers", "mirror"]);
    expect(press("M", { shiftKey: true })).toBe("flip");
  });

  it("maps ⌘+/⌘− to font size and ⌘↑/⌘↓ to the Reading Line", () => {
    const command = { metaKey: true };
    expect(press("=", command)).toBe("fontLarger");
    expect(press("-", command)).toBe("fontSmaller");
    expect(press("ArrowUp", command)).toBe("readingLineUp");
    expect(press("ArrowDown", command)).toBe("readingLineDown");
  });

  it("ignores other keys and other modifiers", () => {
    expect(press("x")).toBeNull();
    expect(press("b", { metaKey: true })).toBeNull();
    expect(press("b", { altKey: true })).toBeNull();
    expect(press("ArrowUp")).toBeNull();
  });
});

describe("applying display actions", () => {
  it("repeats only font size and Reading Line steps while a key is held", () => {
    expect(isRepeatable("fontLarger")).toBe(true);
    expect(isRepeatable("readingLineDown")).toBe(true);
    expect(isRepeatable("markers")).toBe(false);
    expect(isRepeatable("blank")).toBe(false);
  });

  it("toggles markers", () => {
    const hidden = applyAction(DEFAULT_OPTIONS, "markers", "a");
    expect(hidden.markers).toBe(false);
    expect(applyAction(hidden, "markers", "a").markers).toBe(true);
  });

  it("mirrors horizontally and vertically as separate options, per display", () => {
    const mirrored = applyAction(DEFAULT_OPTIONS, "mirror", "glass");
    const flipped = applyAction(mirrored, "flip", "glass");
    expect(mirrorFor(flipped, "glass")).toEqual({ horizontal: true, vertical: true });
    expect(mirrorFor(flipped, "desk")).toEqual({ horizontal: false, vertical: false });
    expect(mirrorTransform(mirrorFor(mirrored, "glass"))).toBe("scale(-1, 1)");
    expect(mirrorTransform(mirrorFor(flipped, "desk"))).toBe("scale(1, 1)");
  });

  it("steps the font size and the Reading Line within limits", () => {
    expect(applyAction(DEFAULT_OPTIONS, "fontLarger", "a").fontSize).toBeGreaterThan(DEFAULT_OPTIONS.fontSize);
    expect(applyAction(DEFAULT_OPTIONS, "fontSmaller", "a").fontSize).toBeLessThan(DEFAULT_OPTIONS.fontSize);
    expect(applyAction(DEFAULT_OPTIONS, "readingLineUp", "a").readingLine).toBeLessThan(DEFAULT_OPTIONS.readingLine);
    let options = DEFAULT_OPTIONS;
    for (let i = 0; i < 100; i++) options = applyAction(applyAction(options, "fontSmaller", "a"), "readingLineUp", "a");
    expect(options.fontSize).toBeGreaterThan(0);
    expect(options.readingLine).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) options = applyAction(applyAction(options, "fontLarger", "a"), "readingLineDown", "a");
    expect(options.fontSize).toBeLessThan(200);
    expect(options.readingLine).toBeLessThan(1);
  });

  it("leaves the options alone on blank, which is not remembered", () => {
    expect(applyAction(DEFAULT_OPTIONS, "blank", "a")).toBe(DEFAULT_OPTIONS);
  });
});

describe("remembering options", () => {
  const memory = () => {
    const items = new Map<string, string>();
    return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
  };

  it("round-trips through storage", () => {
    const storage = memory();
    const options = applyAction(applyAction(DEFAULT_OPTIONS, "markers", "glass"), "mirror", "glass");
    saveOptions(storage, options);
    expect(loadOptions(storage)).toEqual(options);
  });

  it("ignores stored values of the wrong type or out of range", () => {
    const stored = JSON.stringify({ markers: "yes", fontSize: "big", readingLine: 7, mirrors: 3 });
    expect(loadOptions({ getItem: () => stored })).toEqual(DEFAULT_OPTIONS);
  });

  it("falls back to defaults when nothing or garbage is stored", () => {
    expect(loadOptions(memory())).toEqual(DEFAULT_OPTIONS);
    expect(loadOptions({ getItem: () => "{nope" })).toEqual(DEFAULT_OPTIONS);
  });
});

describe("marker placement", () => {
  const words = [{ start: 0 }, { start: 500 }, { start: 900 }];

  it("sits each Named Event before the first Word starting at or after it", () => {
    const placed = markerPlacements(words, [
      { id: "a", name: "intro", time: 0 },
      { id: "b", name: "mid", time: 600 },
      { id: "c", name: "end", time: 5_000 },
    ]);
    expect(placed.map(({ before }) => before)).toEqual([0, 2, 3]);
    expect(placed.map(({ name }) => name)).toEqual(["intro", "mid", "end"]);
  });
});

describe("display commands", () => {
  it("tells the Teleprompter's display actions from other menu commands", () => {
    expect(["blank", "mirror", "readingLineDown"].every(isDisplayAction)).toBe(true);
    expect(isDisplayAction("playPause")).toBe(false);
  });
});
