// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderScriptHint, SCRIPT_HINT } from "./script-hint";

const hint = () => {
  const element = document.createElement("p");
  element.hidden = true;
  return element;
};

describe("renderScriptHint", () => {
  it("tells the presenter how to begin while the Script has no Word", () => {
    const element = hint();

    renderScriptHint(element, 0);

    expect(element.hidden).toBe(false);
    expect(element.textContent).toBe("Press Record (⌘R) to speak your talk, or start typing");
    expect(SCRIPT_HINT).toBe(element.textContent);
  });

  it("goes as soon as the Script has a Word", () => {
    const element = hint();
    renderScriptHint(element, 0);

    renderScriptHint(element, 1);

    expect(element.hidden).toBe(true);
  });
});
