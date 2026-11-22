import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, loadLayout, saveLayout } from "./layout-preferences";

function storage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("layout preferences", () => {
  it("show the Inspector on a machine that has stored none", () => {
    expect(loadLayout(storage())).toEqual({ inspectorShown: true });
  });

  it("round-trip a hidden Inspector", () => {
    const stored = storage();
    saveLayout(stored, { inspectorShown: false });

    expect(loadLayout(stored)).toEqual({ inspectorShown: false });
  });

  it("fall back to the defaults for stored values out of range", () => {
    expect(loadLayout(storage({ "editor-layout": '{"inspectorShown":"no"}' }))).toEqual(DEFAULT_LAYOUT);
    expect(loadLayout(storage({ "editor-layout": "[]" }))).toEqual(DEFAULT_LAYOUT);
    expect(loadLayout(storage({ "editor-layout": "null" }))).toEqual(DEFAULT_LAYOUT);
    expect(loadLayout(storage({ "editor-layout": "not json" }))).toEqual(DEFAULT_LAYOUT);
  });
});
