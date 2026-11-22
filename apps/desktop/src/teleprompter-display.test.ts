import { describe, expect, it, vi } from "vitest";
import { mountDisplay } from "./teleprompter-display";

function mount() {
  const storage = new Map<string, string>();
  const report = vi.fn();
  const render = vi.fn();
  const display = mountDisplay({
    storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => void storage.set(key, value) },
    screenKey: () => "screen",
    render,
    report,
  });
  return { display, report, render, storage };
}

const idle = { window: "teleprompter", blanked: false, markers: true, mirrored: false, flipped: false, ticker: false };

describe("the Teleprompter's display", () => {
  it("reports its display as soon as it is shown", () => {
    expect(mount().report).toHaveBeenLastCalledWith(idle);
  });

  it("reports the new state after each action, as a key or a menu item would run it", () => {
    const { display, report } = mount();

    display.perform("mirror");
    expect(report).toHaveBeenLastCalledWith({ ...idle, mirrored: true });
    display.perform("flip");
    expect(report).toHaveBeenLastCalledWith({ ...idle, mirrored: true, flipped: true });
    display.perform("markers");
    expect(report).toHaveBeenLastCalledWith({ ...idle, mirrored: true, flipped: true, markers: false });
    display.perform("blank");
    expect(report).toHaveBeenLastCalledWith({ ...idle, mirrored: true, flipped: true, markers: false, blanked: true });
    display.perform("blank");
    expect(report).toHaveBeenLastCalledWith({ ...idle, mirrored: true, flipped: true, markers: false });
  });

  it("renders every change and stores the options", () => {
    const { display, render, storage } = mount();

    display.perform("fontLarger");
    display.perform("blank");

    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: 52 }), true);
    expect(storage.get("teleprompter-display-options")).toContain('"fontSize":52');
  });

  it("saves and reports a switch to the Ticker", () => {
    const { display, report, render, storage } = mount();

    display.perform("ticker");

    expect(report).toHaveBeenLastCalledWith({ ...idle, ticker: true });
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ view: "ticker" }), false);
    expect(storage.get("teleprompter-display-options")).toContain('"view":"ticker"');
  });

  it("reports an unchanged mirror for size and Reading Line changes", () => {
    const { display, report, render } = mount();

    display.perform("readingLineUp");

    expect(report).toHaveBeenLastCalledWith(idle);
    expect(render.mock.lastCall![0].readingLine).toBeCloseTo(0.28);
  });
});
