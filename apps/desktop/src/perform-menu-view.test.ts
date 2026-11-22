import { describe, expect, test } from "vitest";
import { AUTOMATIC, chosenSettings, displayChoices } from "./perform-menu-view";

const displays = [
  { name: "Built-in Retina Display", primary: true },
  { name: "Projector", primary: false },
];

describe("display choices", () => {
  test("offer automatic placement and every connected display, the main one marked", () => {
    expect(displayChoices(displays, null)).toEqual([
      { value: AUTOMATIC, label: "Automatic" },
      { value: "Built-in Retina Display", label: "Built-in Retina Display (main)" },
      { value: "Projector", label: "Projector" },
    ]);
  });

  test("keep a remembered display that is not connected, so the choice is not lost", () => {
    expect(displayChoices(displays, "Studio Display").at(-1)).toEqual({
      value: "Studio Display",
      label: "Studio Display (not connected)",
    });
  });

  test("do not repeat a remembered display that is connected", () => {
    expect(displayChoices(displays, "Projector")).toHaveLength(3);
  });
});

describe("chosen settings", () => {
  const menu = {
    layout: "teleprompterOnly",
    teleprompterDisplay: AUTOMATIC,
    presentationDisplay: "Projector",
  };

  test("leave Automatic displays to the core and keep chosen ones", () => {
    expect(chosenSettings(menu)).toEqual({
      layout: "teleprompterOnly",
      teleprompterDisplay: null,
      presentationDisplay: "Projector",
    });
  });

  test("accept the Combined layout", () => {
    expect(chosenSettings({ ...menu, layout: "combined" }).layout).toBe("combined");
  });

  test("refuse a layout the core does not know", () => {
    expect(() => chosenSettings({ ...menu, layout: "sideways" })).toThrow("sideways");
  });
});
