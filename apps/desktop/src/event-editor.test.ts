// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountEventEditor } from "./event-editor";
import type { Edit, SessionState } from "./session";
import { mountTextPane } from "./text-pane";
import { placeCaret } from "./dom-caret";
import { scriptWord } from "./test-words";

const FORM = `
  <form id="event-editor" hidden>
    <input name="name" list="event-names" />
    <datalist id="event-names"></datalist>
    <textarea name="data"></textarea>
    <p role="alert" hidden></p>
    <button type="submit">Save</button>
    <button type="button" data-cancel>Cancel</button>
  </form>
  <article id="script"></article>`;

const settle = () => new Promise((resolve) => setTimeout(resolve));

let form: HTMLFormElement;
let edits: Edit[];
let closed: number;

function mountEditor(names: string[] = [], refuse?: string) {
  return mountEventEditor(form, {
    edit: async (edit) => {
      if (refuse) throw refuse;
      edits.push(edit);
      return {} as SessionState;
    },
    names: () => names,
    closed: () => closed++,
  });
}

const field = <T extends HTMLElement>(selector: string) => form.querySelector<T>(selector)!;

function type(text: string) {
  const name = field<HTMLInputElement>("[name=name]");
  name.value = text;
  name.setSelectionRange(text.length, text.length);
  name.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: text.at(-1) }));
}

beforeEach(() => {
  document.body.innerHTML = FORM;
  form = document.querySelector<HTMLFormElement>("#event-editor")!;
  edits = [];
  closed = 0;
});

describe("the event editor", () => {
  it("opens on a new event with its name field focused and the used names offered", () => {
    mountEditor(["confetti", "slide"]).open({ kind: "new", at: { anchor: "w2", offset: 0 } });

    expect(form.hidden).toBe(false);
    expect(document.activeElement).toBe(field("[name=name]"));
    expect(Array.from(form.querySelectorAll("option"), (option) => option.value)).toEqual(["confetti", "slide"]);
  });

  it("completes a name as it is typed, leaving the completed part selected", () => {
    mountEditor(["confetti", "slide"]).open({ kind: "new", at: { anchor: "w2", offset: 0 } });

    type("sl");

    const name = field<HTMLInputElement>("[name=name]");
    expect(name.value).toBe("slide");
    expect([name.selectionStart, name.selectionEnd]).toEqual([2, 5]);
  });

  it("inserts the event when saved and closes", async () => {
    mountEditor().open({ kind: "new", at: { anchor: "w2", offset: 0 } });
    type("slide");
    field<HTMLTextAreaElement>("[name=data]").value = '{"index": 2}';

    form.requestSubmit();
    await settle();

    expect(edits).toEqual([{ kind: "insertEvent", anchor: "w2", offset: 0, name: "slide", data: { index: 2 } }]);
    expect([form.hidden, closed]).toEqual([true, 1]);
  });

  it("keeps the editor open with the reason when the data is not JSON", async () => {
    mountEditor().open({ kind: "new", at: { anchor: "w2", offset: 0 } });
    type("slide");
    field<HTMLTextAreaElement>("[name=data]").value = "{index: 2}";

    form.requestSubmit();
    await settle();

    expect(edits).toEqual([]);
    expect(form.hidden).toBe(false);
    expect(field("[role=alert]").textContent).toContain("not valid JSON");
  });

  it("keeps the editor open with the reason when the Session refuses the edit", async () => {
    mountEditor([], "no Word with id w2").open({ kind: "new", at: { anchor: "w2", offset: 0 } });
    type("slide");

    form.requestSubmit();
    await settle();

    expect(form.hidden).toBe(false);
    expect(field("[role=alert]").textContent).toBe("no Word with id w2");
  });

  it("opens on an existing event with its name and data, and saves changes to it", async () => {
    const event = { id: "e1", name: "slide", data: { index: 1 }, anchor: "scriptStart", offset: 0, time: 0 };
    mountEditor().open({ kind: "existing", event });
    expect(field<HTMLTextAreaElement>("[name=data]").value).toBe('{\n  "index": 1\n}');

    type("zoom");
    form.requestSubmit();
    await settle();

    expect(edits).toEqual([{ kind: "setEvent", event: "e1", name: "zoom", data: { index: 1 } }]);
  });

  it("closes without an edit on Escape", () => {
    mountEditor().open({ kind: "new", at: { anchor: "w2", offset: 0 } });

    field("[name=name]").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect([form.hidden, closed, edits.length]).toEqual([true, 1, 0]);
  });
});

describe("the text pane's event keys", () => {
  const state = {
    words: [
      scriptWord("w1", "Hello,", { start: 400, gap: 400 }),
      scriptWord("w2", "world.", { start: 850, gap: 150, duration: 450 }),
    ],
    namedEvents: [{ id: "e1", name: "slide", anchor: "w2", offset: 0, time: 850 }],
    movedEvents: [],
    pendingPassages: [],
    locked: false,
  };

  function mountPane() {
    const hooks = { insertEventAt: vi.fn(), selectEvent: vi.fn() };
    const commands = { edit: vi.fn(), cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), undo: vi.fn(), redo: vi.fn() };
    const root = document.querySelector<HTMLElement>("#script")!;
    const pane = mountTextPane(root, commands, hooks, vi.fn());
    pane.render(state);
    return { root, hooks };
  }

  it("⌘E asks for a new event anchored at the caret", async () => {
    const { root, hooks } = mountPane();
    placeCaret(root, { word: "w1", offset: 3 });

    root.dispatchEvent(new KeyboardEvent("keydown", { key: "e", metaKey: true, bubbles: true }));
    await settle();

    expect(hooks.insertEventAt).toHaveBeenCalledWith({ anchor: "w2", offset: 0 });
  });

  it("clicking a chip selects its event", () => {
    const { root, hooks } = mountPane();

    root.querySelector<HTMLElement>('[data-event-id="e1"]')!.click();

    expect(hooks.selectEvent).toHaveBeenCalledWith("e1");
  });
});
