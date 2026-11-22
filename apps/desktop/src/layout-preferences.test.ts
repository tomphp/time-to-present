import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, loadLayout, saveLayout, TIMELINE_HEIGHTS } from "./layout-preferences";

function storage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("layout preferences", () => {
  it("show both cards at a default timeline height on a machine that has stored none", () => {
    expect(loadLayout(storage())).toEqual({ inspectorShown: true, timelineShown: true, timelineHeight: 140 });
  });

  it("round-trip a hidden Inspector, a hidden timeline and its height", () => {
    const stored = storage();
    const layout = { inspectorShown: false, timelineShown: false, timelineHeight: 300 };
    saveLayout(stored, layout);

    expect(loadLayout(stored)).toEqual(layout);
  });

  it("reject a timeline height out of range", () => {
    for (const height of [0, 95, 481, -1, "tall", null]) {
      const stored = storage({ "editor-layout": JSON.stringify({ timelineHeight: height }) });
      expect(loadLayout(stored).timelineHeight).toBe(DEFAULT_LAYOUT.timelineHeight);
    }
  });

  it("accept the limits of the timeline height", () => {
    for (const timelineHeight of [TIMELINE_HEIGHTS.min, TIMELINE_HEIGHTS.max]) {
      const stored = storage();
      saveLayout(stored, { ...DEFAULT_LAYOUT, timelineHeight });
      expect(loadLayout(stored).timelineHeight).toBe(timelineHeight);
    }
  });

  it("fall back to the defaults for stored values out of range", () => {
    expect(loadLayout(storage({ "editor-layout": '{"inspectorShown":"no","timelineShown":1}' }))).toEqual(DEFAULT_LAYOUT);
    expect(loadLayout(storage({ "editor-layout": "[]" }))).toEqual(DEFAULT_LAYOUT);
    expect(loadLayout(storage({ "editor-layout": "null" }))).toEqual(DEFAULT_LAYOUT);
    expect(loadLayout(storage({ "editor-layout": "not json" }))).toEqual(DEFAULT_LAYOUT);
  });
});
