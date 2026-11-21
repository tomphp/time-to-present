// @vitest-environment jsdom
import { expect, test } from "vitest";
import { asKeydown } from "./forwarded-key";

test("a forwarded key is replayed as the keydown the Teleprompter's keymap reads", () => {
  const event = asKeydown({ key: "ArrowUp", meta: false, ctrl: true, alt: false, shift: true, repeat: true });

  expect(event.type).toBe("keydown");
  expect(event).toMatchObject({ key: "ArrowUp", metaKey: false, ctrlKey: true, altKey: false, shiftKey: true, repeat: true });
});
