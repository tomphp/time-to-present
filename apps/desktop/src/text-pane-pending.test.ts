// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectedRange } from "./dom-caret";
import type { PendingPassage, SessionState } from "./session";
import { mountTextPane } from "./text-pane";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,"), scriptWord("w2", "world."), scriptWord("w3", "Typed")];

const state = (pendingPassages: PendingPassage[], scriptWords = words) =>
  ({ words: scriptWords, namedEvents: [], movedEvents: [], pendingPassages }) as unknown as SessionState;

const transcribing = (percent: number): PendingPassage => ({
  recordingId: "r2",
  after: "w1",
  before: "w2",
  status: { kind: "transcribing", percent },
});

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<article id="script"></article>';
  root = document.querySelector<HTMLElement>("#script")!;
});

function mountPane() {
  const commands = { edit: vi.fn(), cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), undo: vi.fn(), redo: vi.fn() };
  const pane = mountTextPane(root, commands, { insertEventAt: vi.fn(), selectEvent: vi.fn() }, vi.fn());
  pane.render(state([transcribing(40)]));
  return pane;
}

function selectWords(from: string, to: string) {
  const text = (id: string) => root.querySelector(`[data-word-id="${id}"]`)!.firstChild!;
  document.getSelection()!.setBaseAndExtent(text(from), 0, text(to), 6);
}

const placeholder = () => root.querySelector<HTMLElement>('[data-recording-id="r2"]')!;

describe("the text pane while a passage is pending", () => {
  it("shows Transcription progress without disturbing a selection of other Words", () => {
    const pane = mountPane();
    selectWords("w1", "w2");

    pane.render(state([transcribing(70)]));

    expect(placeholder().textContent).toBe("Transcribing… 70%");
    expect(selectedRange(root)).toEqual({ start: { word: "w1", offset: 0 }, end: { word: "w2", offset: 6 } });
  });

  it("repaints when the passage lands as Words", () => {
    const pane = mountPane();
    const landed = [words[0], scriptWord("w4", "brave"), words[1], words[2]];

    pane.render(state([], landed));

    expect(placeholder()).toBeNull();
    expect(root.querySelector('[data-word-id="w4"]')!.textContent).toBe("brave");
  });
});
