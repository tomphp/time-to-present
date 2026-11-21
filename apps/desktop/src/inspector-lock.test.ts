// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountInspector } from "./inspector";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,", { gap: 100 })];

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

const controls = () => Array.from(form.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button"));

describe("the edit lock on the inspector", () => {
  it("disables every field and button while locked", () => {
    mountInspector(form, { edit: vi.fn() }).render(words, ["w1"], null, true);

    expect(form.hidden).toBe(false);
    expect(controls().every((control) => control.disabled)).toBe(true);
  });

  it("enables them again when unlocked", () => {
    const inspector = mountInspector(form, { edit: vi.fn() });
    inspector.render(words, ["w1"], null, true);
    inspector.render(words, ["w1"], null, false);

    expect(controls().some((control) => control.disabled)).toBe(false);
  });
});
