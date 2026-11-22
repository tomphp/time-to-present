// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import page from "../editor.html?raw";
import { TIMELINE_HEIGHTS } from "./layout-preferences";
import { mountTimelineDock } from "./timeline-dock";

function load({ shown = true, height = 200 } = {}) {
  document.documentElement.innerHTML = page.replace(/^<!doctype html>/i, "");
  const commands = { shownChanged: vi.fn(), heightChanged: vi.fn() };
  const card = document.querySelector<HTMLElement>("#timeline-card")!;
  const dock = mountTimelineDock(card, commands, { shown, height });
  return { card, commands, dock, body: card.querySelector<HTMLElement>("[data-body]")! };
}

const toggle = () => document.querySelector<HTMLButtonElement>("#timeline-card [data-toggle]")!;
const handle = () => document.querySelector<HTMLElement>("#timeline-card [data-resize]")!;
const pointer = (type: string, clientY: number) => document.dispatchEvent(new MouseEvent(type, { clientY }));
const dragTo = (from: number, to: number) => {
  handle().dispatchEvent(new MouseEvent("pointerdown", { clientY: from, bubbles: true }));
  pointer("pointermove", to);
  pointer("pointerup", to);
};

describe("the docked timeline card", () => {
  it("opens at the remembered height", () => {
    const { card, dock } = load({ height: 250 });

    expect(card.style.getPropertyValue("--timeline-h")).toBe("250px");
    expect([dock.shown(), dock.height()]).toEqual([true, 250]);
  });

  it("collapses from its button, which then offers to expand it", () => {
    const { body, commands, dock } = load();
    expect(toggle().dataset.tooltip).toBe("Hide Timeline");

    toggle().click();

    expect(body.hidden).toBe(true);
    expect(handle().hidden).toBe(true);
    expect(toggle().dataset.tooltip).toBe("Show Timeline");
    expect([dock.shown(), commands.shownChanged.mock.calls]).toEqual([false, [[false]]]);
  });

  it("opens collapsed when it was left collapsed", () => {
    const { body, commands } = load({ shown: false });

    expect(body.hidden).toBe(true);
    expect(commands.shownChanged).not.toHaveBeenCalled();
  });

  it("expands from the View menu as from the button", () => {
    const { body, commands, dock } = load({ shown: false });
    dock.toggle();

    expect(body.hidden).toBe(false);
    expect(commands.shownChanged.mock.calls).toEqual([[true]]);
  });

  it("resizes by dragging its top edge, taller as it goes up", () => {
    const { card, commands, dock } = load({ height: 200 });
    dragTo(500, 440);

    expect(card.style.getPropertyValue("--timeline-h")).toBe("260px");
    expect([dock.height(), commands.heightChanged.mock.calls]).toEqual([260, [[260]]]);
  });

  it("keeps its height within the minimum and maximum", () => {
    const { dock } = load({ height: 200 });

    dragTo(500, 5000);
    expect(dock.height()).toBe(TIMELINE_HEIGHTS.min);

    dragTo(500, -5000);
    expect(dock.height()).toBe(TIMELINE_HEIGHTS.max);
  });

  it("stops resizing once the drag ends", () => {
    const { dock } = load({ height: 200 });
    dragTo(500, 480);
    pointer("pointermove", 100);

    expect(dock.height()).toBe(220);
  });

  it("resizes from the keyboard", () => {
    const { dock, commands } = load({ height: 200 });
    handle().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));

    expect(dock.height()).toBe(220);
    expect(commands.heightChanged).toHaveBeenCalledWith(220);
  });
});
