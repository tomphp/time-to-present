// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { iconButton } from "./icon-button";

describe("iconButton", () => {
  it("is named by its label and shows the shortcut in its tooltip", () => {
    const button = iconButton({ icon: "record", label: "Record", shortcut: "⌘R" });
    expect(button.getAttribute("aria-label")).toBe("Record");
    expect(button.dataset.tooltip).toBe("Record (⌘R)");
  });

  it("shows only its label when it has no shortcut", () => {
    const button = iconButton({ icon: "play-from-cursor", label: "Play from the cursor" });
    expect(button.dataset.tooltip).toBe("Play from the cursor");
  });

  it("shows its icon and no text", () => {
    const button = iconButton({ icon: "play", label: "Play" });
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.textContent).toBe("");
  });
});
