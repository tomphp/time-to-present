// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { find, loadInspector } from "./test-inspector";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,", { gap: 100 })];
const event = { id: "e1", name: "slide", anchor: "w1", offset: 0, time: 0 };

const controls = () =>
  [...find("#timing").querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button"), find<HTMLInputElement>("#event-editor [name=offset]")];

describe("the edit lock on the inspector", () => {
  it("disables every timing field and button while locked", () => {
    const { inspector } = loadInspector();
    inspector.render(words, ["w1"], event, true);

    expect(find("#timing").hidden).toBe(false);
    expect(controls().every((control) => control.disabled)).toBe(true);
  });

  it("enables them again when unlocked", () => {
    const { inspector } = loadInspector();
    inspector.render(words, ["w1"], event, true);
    inspector.render(words, ["w1"], event, false);

    expect(controls().some((control) => control.disabled)).toBe(false);
  });

  it("leaves the button that hides the Inspector alone", () => {
    const { inspector } = loadInspector();
    inspector.render(words, ["w1"], event, true);

    expect(find<HTMLButtonElement>("#inspector [data-toggle]").disabled).toBe(false);
  });
});
