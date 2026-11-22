// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { find, loadInspector, visible } from "./test-inspector";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,", { gap: 120, duration: 340 })];
const event = { id: "e1", name: "slide", data: { index: 1 }, anchor: "w1", offset: -50, time: 70 };

const mode = () =>
  [
    ["hint", visible("#inspector [data-hint]")],
    ["timing", visible("#timing")],
    ["named event", visible("#event-editor")],
  ]
    .filter(([, shown]) => shown)
    .map(([name]) => name);

describe("the Inspector's mode", () => {
  it("is a hint when nothing is selected", () => {
    const { inspector } = loadInspector();
    inspector.render(words, [], null, false);

    expect(mode()).toEqual(["hint"]);
    expect(find("#inspector [data-hint]").textContent).toContain("Select a Word to see its timing");
  });

  it("is the selection's timing when a Word is selected", () => {
    const { inspector } = loadInspector();
    inspector.render(words, ["w1"], null, false);

    expect(mode()).toEqual(["timing"]);
    expect(find<HTMLInputElement>("#timing [name=gap]").value).toBe("120");
    expect(find<HTMLInputElement>("#timing [name=duration]").value).toBe("340");
  });

  it("is a new Named Event while one is being added, without an offset yet", () => {
    const { inspector } = loadInspector();
    inspector.render(words, [], null, false);
    inspector.openEvent({ kind: "new", at: { anchor: "w1", offset: 0 } });

    expect(mode()).toEqual(["named event"]);
    expect(visible("#event-editor [name=offset]")).toBe(false);
  });

  it("is the selected Named Event with its name, data and offset", () => {
    const { inspector } = loadInspector();
    inspector.render(words, [], event, false);
    inspector.openEvent({ kind: "existing", event });

    expect(mode()).toEqual(["named event"]);
    expect(find<HTMLInputElement>("#event-editor [name=name]").value).toBe("slide");
    expect(find<HTMLInputElement>("#event-editor [name=offset]").value).toBe("-50");
  });

  it("keeps the Named Event over a Word selection until it is closed", () => {
    const { inspector, commands } = loadInspector();
    inspector.render(words, ["w1"], event, false);
    inspector.openEvent({ kind: "existing", event });
    expect(mode()).toEqual(["named event"]);

    find("#event-editor [data-cancel]").click();

    expect(mode()).toEqual(["timing"]);
    expect(commands.closed).toHaveBeenCalledTimes(1);
  });

  it("sets the selected Named Event's offset from its field", () => {
    const { inspector, commands } = loadInspector();
    inspector.render(words, [], event, false);
    inspector.openEvent({ kind: "existing", event });
    const offset = find<HTMLInputElement>("#event-editor [name=offset]");

    offset.value = "200";
    offset.dispatchEvent(new Event("change"));

    expect(commands.edit).toHaveBeenCalledWith({ kind: "setOffset", event: "e1", offset: 200 });
  });
});
