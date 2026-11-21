// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Caret } from "./caret";
import { currentCaret, placeCaret, selectedRange } from "./dom-caret";
import { renderScript } from "./pane-render";
import type { ScriptWord } from "./session";

const word = (id: string, text: string, breakAfter?: ScriptWord["breakAfter"], confidence: number | null = null): ScriptWord => ({
  id,
  text,
  start: 0,
  duration: 300,
  confidence,
  breakAfter,
});

const words = [word("w1", "Hello,", undefined, 0.4), word("w2", "wörld.", "paragraph"), word("w3", "Typed")];
let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<article id="script"></article>';
  root = document.querySelector<HTMLElement>("#script")!;
});

describe("renderScript", () => {
  it("renders paragraphs of Word spans and underlines low confidence", () => {
    renderScript(root, words, null);

    expect(root.innerHTML).toBe(
      '<p><span data-word-id="w1" class="word low-confidence">Hello,</span> ' +
        '<span data-word-id="w2" class="word">wörld.</span></p>' +
        '<p><span data-word-id="w3" class="word">Typed</span></p>',
    );
  });

  it("renders the slot before the Word that follows it, or at the end", () => {
    renderScript(root, words, { slotAfter: "w2" });
    expect(root.querySelector("p:last-child")!.innerHTML).toBe(
      '<span class="slot" data-slot-after="w2">​</span> <span data-word-id="w3" class="word">Typed</span>',
    );

    renderScript(root, words, { slotAfter: "w3" });
    expect(root.querySelector("p:last-child")!.innerHTML).toContain('</span> <span class="slot" data-slot-after="w3">');

    renderScript(root, [], { slotAfter: null });
    expect(root.innerHTML).toBe('<p> <span class="slot" data-slot-after="">​</span></p>');
  });
});

describe("placing and reading the caret", () => {
  const carets: Caret[] = [
    { word: "w1", offset: 0 },
    { word: "w1", offset: 6 },
    { word: "w2", offset: 2 },
    { word: "w3", offset: 5 },
    { slotAfter: "w1" },
  ];

  it.each(carets)("round-trips %j", (caret) => {
    renderScript(root, words, { slotAfter: "w1" });

    placeCaret(root, caret);

    expect(currentCaret(root)).toEqual(caret);
    expect(selectedRange(root)).toEqual({ start: caret, end: caret });
  });

  it("reads a caret in the space between Words as the boundary it sits on", () => {
    renderScript(root, words, null);
    const space = root.querySelector("p")!.childNodes[1] as Text;

    document.getSelection()!.setBaseAndExtent(space, 0, space, 0);
    expect(currentCaret(root)).toEqual({ word: "w1", offset: 6 });

    document.getSelection()!.setBaseAndExtent(space, 1, space, 1);
    expect(currentCaret(root)).toEqual({ word: "w2", offset: 0 });
  });

  it("reads a caret on a paragraph element as the nearest Word boundary", () => {
    renderScript(root, words, null);
    const paragraph = root.querySelector("p")!;

    document.getSelection()!.setBaseAndExtent(paragraph, 3, paragraph, 3);

    expect(currentCaret(root)).toEqual({ word: "w2", offset: 6 });
  });

  it("reads a selection across Words as a range", () => {
    renderScript(root, words, null);
    const [hello, , world] = Array.from(root.querySelector("p")!.childNodes);

    document.getSelection()!.setBaseAndExtent(hello.firstChild!, 3, world.firstChild!, 2);

    expect(selectedRange(root)).toEqual({ start: { word: "w1", offset: 3 }, end: { word: "w2", offset: 2 } });
  });

  it("is null when the selection is outside the pane", () => {
    renderScript(root, words, null);
    document.body.append("outside");

    document.getSelection()!.setBaseAndExtent(document.body.lastChild!, 0, document.body.lastChild!, 0);

    expect(currentCaret(root)).toBeNull();
    expect(selectedRange(root)).toBeNull();
  });
});
