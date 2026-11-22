import { expect, test } from "vitest";
import { fullscreenKey } from "./fullscreen-key";

const press = (key: string, modifiers: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

test("Esc leaves Fullscreen", () => {
  expect(fullscreenKey(press("Escape"))).toBe("leave");
});

test("⌃⌘F toggles Fullscreen", () => {
  expect(fullscreenKey(press("f", { ctrlKey: true, metaKey: true }))).toBe("toggle");
});

test("other keys and combinations are left to the rest of the keymap", () => {
  const others = [
    press("f"),
    press("f", { metaKey: true }),
    press("f", { ctrlKey: true }),
    press("F", { ctrlKey: true, metaKey: true, shiftKey: true }),
    press("f", { ctrlKey: true, metaKey: true, altKey: true }),
    press(" "),
  ];

  for (const keys of others) expect(fullscreenKey(keys)).toBeNull();
});
