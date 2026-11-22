// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountInspector } from "./inspector";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,"), scriptWord("w2", "world.")];

let form: HTMLFormElement;
beforeEach(() => {
  document.body.innerHTML = `
    <form id="inspector" hidden>
      <span data-word>
        <input name="gap" /><input name="duration" /><input name="percent" value="100" />
        <button type="submit">Retime</button>
      </span>
      <span data-event><input name="offset" /></span>
      <p role="alert" hidden></p>
    </form>`;
  form = document.querySelector<HTMLFormElement>("#inspector")!;
});

const percent = () => form.querySelector<HTMLInputElement>("[name=percent]")!;

describe("Retime… from the menu", () => {
  it("focuses the Retime field with its value selected, ready to type over", () => {
    const inspector = mountInspector(form, { edit: vi.fn() });
    inspector.render(words, ["w1", "w2"], null, false);
    inspector.retime();

    expect(document.activeElement).toBe(percent());
    expect([percent().selectionStart, percent().selectionEnd]).toEqual([0, 3]);
  });

  it("leaves the focus alone when no Word is selected", () => {
    const inspector = mountInspector(form, { edit: vi.fn() });
    inspector.render(words, [], null, false);
    inspector.retime();

    expect(document.activeElement).not.toBe(percent());
  });
});
