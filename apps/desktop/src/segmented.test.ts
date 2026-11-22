// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { segmented } from "./segmented";

const layouts = [
  { value: "twoWindows", label: "Two windows" },
  { value: "combined", label: "Combined" },
];

const pressed = (control: HTMLElement) =>
  [...control.querySelectorAll("button")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);

describe("segmented", () => {
  it("shows the chosen option as pressed", () => {
    const control = segmented({ label: "Layout", options: layouts, value: "combined", onChange: () => {} });
    expect(pressed(control.element)).toEqual(["Combined"]);
  });

  it("chooses the clicked option and reports it", () => {
    const onChange = vi.fn();
    const control = segmented({ label: "Layout", options: layouts, value: "combined", onChange });
    control.element.querySelector("button")!.click();
    expect(pressed(control.element)).toEqual(["Two windows"]);
    expect(onChange).toHaveBeenCalledWith("twoWindows");
  });

  it("shows a choice made elsewhere without reporting it", () => {
    const onChange = vi.fn();
    const control = segmented({ label: "Layout", options: layouts, value: "combined", onChange });
    control.show("twoWindows");
    expect(pressed(control.element)).toEqual(["Two windows"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is named for assistive tech", () => {
    const control = segmented({ label: "Layout", options: layouts, value: "combined", onChange: () => {} });
    expect(control.element.getAttribute("aria-label")).toBe("Layout");
  });
});
