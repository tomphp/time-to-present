import { describe, expect, test } from "vitest";
import { choiceFor, chosenSize, customSize, isValidPixels, shownNote, sizeChoices, sizeValue } from "./presentation-size-view";
import type { SizePreset } from "./session";

const presets: SizePreset[] = [
  { width: 1280, height: 720, shape: "landscape" },
  { width: 1920, height: 1080, shape: "landscape" },
  { width: 1080, height: 1920, shape: "vertical" },
  { width: 1080, height: 1080, shape: "square" },
  { width: 1080, height: 1350, shape: "portrait" },
];

describe("size choices", () => {
  test("group the core's presets by shape, each labelled with its aspect ratio, then Custom and Fill display", () => {
    expect(sizeChoices(presets)).toEqual([
      {
        group: "Landscape 16:9",
        choices: [
          { value: "1280x720", label: "1280×720 (16:9 landscape)" },
          { value: "1920x1080", label: "1920×1080 (16:9 landscape)" },
        ],
      },
      { group: "Vertical 9:16", choices: [{ value: "1080x1920", label: "1080×1920 (9:16 vertical)" }] },
      { group: "Square 1:1", choices: [{ value: "1080x1080", label: "1080×1080 (1:1 square)" }] },
      { group: "Portrait 4:5", choices: [{ value: "1080x1350", label: "1080×1350 (4:5 portrait)" }] },
      { value: "custom", label: "Custom…" },
      { value: "fillDisplay", label: "Fill display" },
    ]);
  });
});

describe("chosen size", () => {
  test("reads a preset as its pixels", () => {
    expect(chosenSize("1080x1920")).toEqual({ width: 1080, height: 1920 });
  });

  test("reads Fill display", () => {
    expect(chosenSize("fillDisplay")).toBe("fillDisplay");
  });

  test("refuses a choice the menu does not offer", () => {
    expect(() => chosenSize("fit")).toThrow("fit");
    expect(() => chosenSize("10.5x20")).toThrow("10.5x20");
  });

  test("shows a saved size as its choice", () => {
    expect(sizeValue({ width: 1080, height: 1920 })).toBe("1080x1920");
    expect(sizeValue("fillDisplay")).toBe("fillDisplay");
  });
});

describe("custom size", () => {
  test("reads whole-number fields within 320 to 7680", () => {
    expect(customSize("1000", "2000")).toEqual({ width: 1000, height: 2000 });
    expect(customSize("320", "7680")).toEqual({ width: 320, height: 7680 });
  });

  test.each([
    ["319", "720"],
    ["1280", "7681"],
    ["10.5", "720"],
    ["", "720"],
    ["abc", "720"],
    ["-400", "720"],
  ])("refuses %s by %s", (width, height) => {
    expect(customSize(width, height)).toBeNull();
  });

  test("judges each field on its own", () => {
    expect(isValidPixels("500")).toBe(true);
    expect(isValidPixels("100")).toBe(false);
  });

  test("shows a saved size as its preset, Fill display, or Custom", () => {
    expect(choiceFor({ width: 1080, height: 1920 }, presets)).toBe("1080x1920");
    expect(choiceFor("fillDisplay", presets)).toBe("fillDisplay");
    expect(choiceFor({ width: 1000, height: 2000 }, presets)).toBe("custom");
  });
});

describe("shown note", () => {
  test("says the size shown when the window shrank", () => {
    expect(shownNote({ width: 1620, height: 2880, shrank: true })).toBe("shown at 1620×2880");
  });

  test("is absent when the window opens at the chosen size", () => {
    expect(shownNote({ width: 1080, height: 1920, shrank: false })).toBeNull();
  });

  test("is absent when no display is connected", () => {
    expect(shownNote(null)).toBeNull();
  });
});
