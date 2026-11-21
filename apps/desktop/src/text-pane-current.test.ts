// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScriptWord, SessionState } from "./session";
import { scriptWord } from "./test-words";
import { mountTextPane } from "./text-pane";

const hello = [scriptWord("w1", "Hello,"), scriptWord("w2", "world.", { start: 300 })];

const state = (words: ScriptWord[]) =>
  ({ words, namedEvents: [], movedEvents: [], pendingPassages: [], locked: true }) as unknown as SessionState;

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<article id="script"></article>';
  root = document.querySelector<HTMLElement>("#script")!;
  Element.prototype.scrollIntoView = vi.fn();
});

function mountPane() {
  const commands = { edit: vi.fn(), cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), undo: vi.fn(), redo: vi.fn() };
  const pane = mountTextPane(root, commands, { insertEventAt: vi.fn(), selectEvent: vi.fn() }, vi.fn());
  pane.render(state(hello));
  return pane;
}

const current = () => Array.from(root.querySelectorAll<HTMLElement>(".word.current"), (span) => span.dataset.wordId);

describe("the current Word in the text pane", () => {
  it("highlights the Word the clock is on, and only that one", () => {
    const pane = mountPane();

    pane.highlight("w1");
    pane.highlight("w2");

    expect(current()).toEqual(["w2"]);
  });

  it("keeps the highlight when the Script is rendered afresh", () => {
    const pane = mountPane();
    pane.highlight("w2");

    pane.render(state([...hello, scriptWord("w3", "Again", { start: 900 })]));

    expect(current()).toEqual(["w2"]);
  });

  it("clears it when the clock is on no Word", () => {
    const pane = mountPane();
    pane.highlight("w1");

    pane.highlight(null);

    expect(current()).toEqual([]);
  });
});
