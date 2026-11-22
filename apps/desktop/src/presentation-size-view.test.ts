import { describe, expect, test } from "vitest";
import { chosenSize, sizeChoices, sizeValue } from "./presentation-size-view";
import type { SizePreset } from "./session";

const presets: SizePreset[] = [
  { width: 1280, height: 720, shape: "landscape" },
  { width: 1920, height: 1080, shape: "landscape" },
  { width: 1080, height: 1920, shape: "vertical" },
  { width: 1080, height: 1080, shape: "square" },
  { width: 1080, height: 1350, shape: "portrait" },
];

describe("size choices", () => {
  test("group the core's presets by shape, each labelled with its aspect ratio, then Fill display", () => {
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
