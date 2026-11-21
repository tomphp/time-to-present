import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBINED,
  dividerShare,
  letterbox,
  loadCombined,
  paneWidths,
  saveCombined,
  swapSides,
} from "./combined-layout";

describe("letterbox", () => {
  it("fills a 16:9 pane exactly", () => {
    expect(letterbox({ width: 1600, height: 900 })).toEqual({ left: 0, top: 0, width: 1600, height: 900 });
  });

  it("bars the top and bottom of a pane taller than 16:9", () => {
    expect(letterbox({ width: 800, height: 900 })).toEqual({ left: 0, top: 225, width: 800, height: 450 });
  });

  it("bars the sides of a pane wider than 16:9", () => {
    expect(letterbox({ width: 1920, height: 540 })).toEqual({ left: 480, top: 0, width: 960, height: 540 });
  });

  it("shows nothing in an empty pane", () => {
    expect(letterbox({ width: 0, height: 0 })).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });
});

describe("pane widths", () => {
  it("give the app its share and the Teleprompter the rest, less the divider", () => {
    expect(paneWidths(1000, 0.6, 10)).toEqual({ app: 594, teleprompter: 396 });
  });
});

describe("divider share", () => {
  it("is the app's share of the width at the pointer, with the app on the left", () => {
    expect(dividerShare(300, 1000, "left")).toBe(0.3);
  });

  it("measures from the right when the app is on the right", () => {
    expect(dividerShare(300, 1000, "right")).toBe(0.7);
  });

  it("keeps both panes usable", () => {
    expect(dividerShare(0, 1000, "left")).toBe(0.2);
    expect(dividerShare(1000, 1000, "left")).toBe(0.8);
  });

  it("holds the default share in a window with no width", () => {
    expect(dividerShare(10, 0, "left")).toBe(DEFAULT_COMBINED.share);
  });
});

describe("remembered layout", () => {
  const memory = () => {
    const items = new Map<string, string>();
    return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
  };

  it("starts with the app on the left, taking most of the window", () => {
    expect(loadCombined(memory())).toEqual({ side: "left", share: 0.6 });
  });

  it("swaps the sides and keeps the share", () => {
    expect(swapSides({ side: "left", share: 0.4 })).toEqual({ side: "right", share: 0.4 });
  });

  it("round-trips through storage", () => {
    const storage = memory();
    saveCombined(storage, { side: "right", share: 0.35 });
    expect(loadCombined(storage)).toEqual({ side: "right", share: 0.35 });
  });

  it("falls back to the default for anything unusable", () => {
    const storage = memory();
    storage.setItem("combined-layout", JSON.stringify({ side: "top", share: 7 }));
    expect(loadCombined(storage)).toEqual(DEFAULT_COMBINED);
    storage.setItem("combined-layout", "{");
    expect(loadCombined(storage)).toEqual(DEFAULT_COMBINED);
  });
});
