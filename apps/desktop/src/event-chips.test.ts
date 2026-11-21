// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { currentCaret } from "./dom-caret";
import { renderScript, type Chips } from "./pane-render";
import type { ScriptWord, TimedEvent } from "./session";

const word = (id: string, text: string, breakAfter?: ScriptWord["breakAfter"]): ScriptWord => ({
  id,
  text,
  start: 0,
  duration: 300,
  confidence: null,
  breakAfter,
});

const event = (id: string, name: string, anchor: string, time: number): TimedEvent => ({
  id,
  name,
  anchor,
  offset: 0,
  time,
});

const words = [word("w1", "Hello,"), word("w2", "world.", "paragraph"), word("w3", "Typed")];
const chips: Chips = {
  events: [event("e2", "confetti", "w3", 2200), event("e1", "slide", "scriptStart", 0), event("e3", "zoom", "w3", 1400)],
  moved: ["e2"],
  selected: "e1",
};

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<article id="script"></article>';
  root = document.querySelector<HTMLElement>("#script")!;
});

const sequence = (paragraph: Element) =>
  Array.from(paragraph.childNodes).map((node) =>
    node instanceof HTMLElement ? (node.dataset.eventId ?? node.dataset.wordId ?? node.className) : node.textContent,
  );

describe("rendering Named Event chips", () => {
  it("shows each event as a chip before its anchor Word, in Script Time order", () => {
    renderScript(root, words, null, chips);

    const [first, second] = Array.from(root.querySelectorAll("p"));
    expect(sequence(first)).toEqual(["e1", "w1", " ", "w2"]);
    expect(sequence(second)).toEqual(["e3", "e2", "w3"]);
  });

  it("labels a chip with the event's name and keeps it out of the editable text", () => {
    renderScript(root, words, null, chips);

    const chip = root.querySelector<HTMLElement>('[data-event-id="e2"]')!;
    expect(chip.textContent).toBe("confetti");
    expect(chip.contentEditable).toBe("false");
  });

  it("marks the Moved events and the selected one", () => {
    renderScript(root, words, null, chips);

    const classes = (id: string) => root.querySelector(`[data-event-id="${id}"]`)!.className;
    expect(classes("e2")).toBe("event-chip moved");
    expect(classes("e1")).toBe("event-chip selected");
    expect(classes("e3")).toBe("event-chip");
  });

  it("puts the open slot before the chips of the Word after it", () => {
    renderScript(root, words, { slotAfter: "w2" }, chips);

    expect(sequence(root.querySelector("p:last-child")!)).toEqual(["slot", " ", "e3", "e2", "w3"]);
  });

  it("shows Script start chips in an empty Script", () => {
    renderScript(root, [], { slotAfter: null }, { events: [event("e1", "slide", "scriptStart", 0)], moved: [], selected: null });

    expect(sequence(root.querySelector("p")!)).toEqual(["e1", " ", "slot"]);
  });
});

describe("reading the caret around chips", () => {
  it("reads a caret inside a chip as the start of its Word", () => {
    renderScript(root, words, null, chips);
    const chip = root.querySelector('[data-event-id="e2"]')!.firstChild!;

    document.getSelection()!.setBaseAndExtent(chip, 2, chip, 2);

    expect(currentCaret(root)).toEqual({ word: "w3", offset: 0 });
  });

  it("reads a caret just after a chip as the start of its Word", () => {
    renderScript(root, words, null, chips);
    const paragraph = root.querySelector("p:last-child")!;

    document.getSelection()!.setBaseAndExtent(paragraph, 2, paragraph, 2);

    expect(currentCaret(root)).toEqual({ word: "w3", offset: 0 });
  });
});
