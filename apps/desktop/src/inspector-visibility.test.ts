// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { find, loadInspector, visible } from "./test-inspector";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,")];
const event = { id: "e1", name: "slide", anchor: "w1", offset: 0, time: 0 };
const toggle = () => find<HTMLButtonElement>("#inspector [data-toggle]");

describe("hiding the Inspector", () => {
  it("hides it from the button on its card, which then offers to show it", () => {
    const { inspector, commands } = loadInspector();
    inspector.render(words, ["w1"], null, false);
    expect(toggle().dataset.tooltip).toBe("Hide Inspector");

    toggle().click();

    expect(visible("#timing")).toBe(false);
    expect(visible("#inspector [data-toggle]")).toBe(true);
    expect(toggle().dataset.tooltip).toBe("Show Inspector");
    expect([inspector.shown(), commands.shownChanged.mock.calls]).toEqual([false, [[false]]]);
  });

  it("shows it again from the same button", () => {
    const { inspector } = loadInspector({ shown: false });
    inspector.render(words, [], null, false);
    expect(visible("#inspector [data-hint]")).toBe(false);

    toggle().click();

    expect(visible("#inspector [data-hint]")).toBe(true);
  });

  it("toggles from the View menu as the button does", () => {
    const { inspector, commands } = loadInspector();
    inspector.toggle();
    inspector.toggle();

    expect(commands.shownChanged.mock.calls).toEqual([[false], [true]]);
  });

  it("stays hidden when a Word or a Named Event is selected", () => {
    const { inspector } = loadInspector({ shown: false });
    inspector.render(words, ["w1"], event, false);
    inspector.openEvent({ kind: "existing", event });

    expect(inspector.shown()).toBe(false);
    expect(visible("#event-editor")).toBe(false);
  });

  it("shows again to add a Named Event, ready to type its name", () => {
    const { inspector, commands } = loadInspector({ shown: false });
    inspector.render(words, [], null, false);
    inspector.openEvent({ kind: "new", at: { anchor: "w1", offset: 0 } });

    expect(visible("#event-editor")).toBe(true);
    expect(document.activeElement).toBe(find("#event-editor [name=name]"));
    expect(commands.shownChanged).toHaveBeenCalledWith(true);
  });

  it("shows again for Retime…, with the Retime field focused", () => {
    const { inspector } = loadInspector({ shown: false });
    inspector.render(words, ["w1"], null, false);
    inspector.retime();

    expect(visible("#timing")).toBe(true);
    expect(document.activeElement).toBe(find("#timing [name=percent]"));
  });
});
