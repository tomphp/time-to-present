// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { find, loadInspector } from "./test-inspector";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,"), scriptWord("w2", "world.")];

const percent = () => find<HTMLInputElement>("#timing [name=percent]");

describe("Retime… from the menu", () => {
  it("focuses the Retime field with its value selected, ready to type over", () => {
    const { inspector } = loadInspector();
    inspector.render(words, ["w1", "w2"], null, false);
    inspector.retime();

    expect(document.activeElement).toBe(percent());
    expect([percent().selectionStart, percent().selectionEnd]).toEqual([0, 3]);
  });

  it("leaves the focus alone when no Word is selected", () => {
    const { inspector } = loadInspector();
    inspector.render(words, [], null, false);
    inspector.retime();

    expect(document.activeElement).not.toBe(percent());
  });

  it("retimes the selected Words by the percentage", () => {
    const { inspector, commands } = loadInspector();
    inspector.render(words, ["w1", "w2"], null, false);
    percent().value = "120";
    find<HTMLFormElement>("#timing").requestSubmit();

    expect(commands.edit).toHaveBeenCalledWith({ kind: "retime", words: ["w1", "w2"], percent: 120 });
  });
});
