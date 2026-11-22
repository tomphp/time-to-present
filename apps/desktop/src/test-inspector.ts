import { vi } from "vitest";
import page from "../editor.html?raw";
import { mountInspector } from "./inspector";

/** The Editor's page with a mounted Inspector, its commands recorded. */
export function loadInspector({ shown = true } = {}) {
  document.documentElement.innerHTML = page.replace(/^<!doctype html>/i, "");
  const commands = {
    edit: vi.fn(async () => ({}) as never),
    names: () => ["slide"],
    closed: vi.fn(),
    shownChanged: vi.fn(),
  };
  const card = document.querySelector<HTMLElement>("#inspector")!;
  return { card, commands, inspector: mountInspector(card, commands, shown) };
}

export const find = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

export const visible = (selector: string) => !find(selector).closest("[hidden]");
