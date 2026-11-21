// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "./session";
import { scriptWord } from "./test-words";
import { mountTextPane } from "./text-pane";

const settle = () => new Promise((resolve) => setTimeout(resolve));

const script = [scriptWord("w1", "Hello,"), scriptWord("w2", "world.", { start: 300 })];
const chip = { id: "e1", name: "slide", anchor: "w2", offset: 0, time: 300 };

const state = (locked: boolean) =>
  ({ words: script, namedEvents: [chip], movedEvents: [], pendingPassages: [], locked }) as unknown as SessionState;

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<article id="script"></article>';
  root = document.querySelector<HTMLElement>("#script")!;
});

function mountPane(locked: boolean) {
  const commands = {
    edit: vi.fn(async () => state(locked)),
    cut: vi.fn(async () => state(locked)),
    copy: vi.fn(async () => {}),
    paste: vi.fn(async () => state(locked)),
    undo: vi.fn(async () => state(locked)),
    redo: vi.fn(async () => state(locked)),
  };
  const hooks = { insertEventAt: vi.fn(), selectEvent: vi.fn() };
  const onSelect = vi.fn();
  const pane = mountTextPane(root, commands, hooks, onSelect);
  pane.render(state(locked));
  return { commands, hooks, pane };
}

function selectAll() {
  const text = (id: string) => root.querySelector(`[data-word-id="${id}"]`)!.firstChild!;
  document.getSelection()!.setBaseAndExtent(text("w1"), 0, text("w2"), 6);
}

function clipboardEvent(type: string, text = "typed") {
  const event = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent;
  const data: Record<string, string> = { "text/plain": text };
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (kind: string) => data[kind] ?? "", setData: (kind: string, value: string) => (data[kind] = value) },
  });
  return event;
}

const command = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { key, metaKey: true, bubbles: true, cancelable: true, ...init });

const pointer = (type: string, clientX: number) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });

function dragChip() {
  const w1 = root.querySelector<HTMLElement>('[data-word-id="w1"]')!;
  w1.getBoundingClientRect = () => ({ left: 0, width: 40 }) as DOMRect;
  document.elementFromPoint = () => w1;
  root.querySelector<HTMLElement>('[data-event-id="e1"]')!.dispatchEvent(pointer("pointerdown", 100));
  document.dispatchEvent(pointer("pointermove", 50));
  document.dispatchEvent(pointer("pointerup", 10));
}

describe("the edit lock on the text pane", () => {
  it("renders the pane read-only from the state", () => {
    mountPane(true);

    expect(root.contentEditable).toBe("false");
    expect(root.classList.contains("locked")).toBe(true);
  });

  it("never drags a chip while locked", () => {
    const { commands } = mountPane(true);

    dragChip();

    expect(commands.edit).not.toHaveBeenCalled();
    expect(root.querySelector(".dragging")).toBeNull();
  });

  it("drags a chip onto a Word when unlocked", () => {
    const { commands } = mountPane(false);

    dragChip();

    expect(commands.edit).toHaveBeenCalledWith({ kind: "moveEvent", event: "e1", anchor: "w1", offset: 0 });
  });

  it("locks and unlocks a pane whose Script has not changed", () => {
    const { pane } = mountPane(false);

    pane.render(state(true));
    expect(root.contentEditable).toBe("false");

    pane.render(state(false));
    expect(root.contentEditable).toBe("true");
    expect(root.classList.contains("locked")).toBe(false);
  });

  it("unlocks again on the next state", () => {
    mountPane(true);
    document.body.innerHTML = '<article id="script"></article>';
    root = document.querySelector<HTMLElement>("#script")!;
    mountPane(false);

    expect(root.contentEditable).toBe("true");
    expect(root.classList.contains("locked")).toBe(false);
  });

  it("sends no command for keys, cut, paste or chip clicks while locked", async () => {
    const { commands, hooks } = mountPane(true);
    selectAll();

    root.dispatchEvent(command("z"));
    root.dispatchEvent(command("z", { shiftKey: true }));
    root.dispatchEvent(command("e"));
    root.dispatchEvent(clipboardEvent("cut"));
    root.dispatchEvent(clipboardEvent("paste"));
    root.querySelector<HTMLElement>('[data-event-id="e1"]')!.click();
    await settle();

    expect(commands.undo).not.toHaveBeenCalled();
    expect(commands.redo).not.toHaveBeenCalled();
    expect(commands.cut).not.toHaveBeenCalled();
    expect(commands.paste).not.toHaveBeenCalled();
    expect(hooks.insertEventAt).not.toHaveBeenCalled();
    expect(hooks.selectEvent).not.toHaveBeenCalled();
  });

  it("still copies while locked", async () => {
    const { commands } = mountPane(true);
    selectAll();

    root.dispatchEvent(clipboardEvent("copy"));
    await settle();

    expect(commands.copy).toHaveBeenCalledWith(["w1", "w2"]);
  });
});
