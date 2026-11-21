// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScriptWord, SessionState } from "./session";
import { mountTextPane } from "./text-pane";
import { scriptWord } from "./test-words";

const settle = () => new Promise((resolve) => setTimeout(resolve));

const word = (id: string, text: string, breakAfter?: ScriptWord["breakAfter"]) => scriptWord(id, text, { breakAfter });

const state = (words: ScriptWord[]) => ({ words, namedEvents: [], movedEvents: [] }) as unknown as SessionState;
const script = [word("w1", "Hello,", "line"), word("w2", "world."), word("w3", "Typed")];

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<article id="script"></article>';
  root = document.querySelector<HTMLElement>("#script")!;
});

function mountPane() {
  const commands = {
    edit: vi.fn(),
    cut: vi.fn(async () => state([script[2]])),
    copy: vi.fn(async () => {}),
    paste: vi.fn(async () => state([word("w4", "pasted"), ...script])),
    undo: vi.fn(),
    redo: vi.fn(),
  };
  const pane = mountTextPane(root, commands, { insertEventAt: vi.fn(), selectEvent: vi.fn() }, vi.fn());
  pane.render(state(script));
  return commands;
}

function select(from: [string, number], to: [string, number]) {
  const text = (id: string) => root.querySelector(`[data-word-id="${id}"]`)!.firstChild!;
  document.getSelection()!.setBaseAndExtent(text(from[0]), from[1], text(to[0]), to[1]);
}

/** Fires a clipboard event, returning what the pane put on the system clipboard. */
function clipboardEvent(type: "cut" | "copy" | "paste", pasted = "") {
  const data = new Map<string, string>([["text/plain", pasted]]);
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { setData: (kind: string, text: string) => data.set(kind, text), getData: (kind: string) => data.get(kind) },
  });
  root.dispatchEvent(event);
  return { text: data.get("text/plain"), defaultPrevented: event.defaultPrevented };
}

describe("the text pane's clipboard", () => {
  it("copies the selected Words to the Session and their text to the system clipboard", async () => {
    const commands = mountPane();
    select(["w1", 2], ["w2", 3]);

    const copied = clipboardEvent("copy");
    await settle();

    expect(copied).toEqual({ text: "Hello,\nworld.", defaultPrevented: true });
    expect(commands.copy).toHaveBeenCalledWith(["w1", "w2"]);
  });

  it("cuts the selected Words", async () => {
    const commands = mountPane();
    select(["w1", 0], ["w2", 6]);

    expect(clipboardEvent("cut").text).toBe("Hello,\nworld.");
    await settle();

    expect(commands.cut).toHaveBeenCalledWith(["w1", "w2"]);
    const rendered = [...root.querySelectorAll<HTMLElement>("[data-word-id]")].map((span) => span.dataset.wordId);
    expect(rendered).toEqual(["w3"]);
  });

  it("pastes the system clipboard's text where the caret is", async () => {
    const commands = mountPane();
    select(["w1", 0], ["w1", 0]);

    clipboardEvent("paste", "pasted");
    await settle();

    expect(commands.paste).toHaveBeenCalledWith(null, [], "pasted");
  });

  it("pastes over a selection replacing the Words it covers", async () => {
    const commands = mountPane();
    commands.paste.mockResolvedValue(state([script[0], word("w4", "pasted")]));
    select(["w2", 1], ["w3", 2]);

    clipboardEvent("paste", "pasted");
    await settle();

    expect(commands.paste).toHaveBeenCalledWith("w1", ["w2", "w3"], "pasted");
    expect(document.getSelection()!.focusNode!.textContent).toBe("pasted");
  });
});
