// @vitest-environment jsdom
import { beforeAll, expect, test, vi } from "vitest";
import forwardKeys from "../src-tauri/src/forward-keys.js?raw";

type TauriWindow = Window & { __TAURI_INTERNALS__?: { invoke: (command: string, args: unknown) => Promise<void> } };

const invoke = vi.fn(() => Promise.resolve());
const pageListener = vi.fn();

beforeAll(() => {
  delete (window as TauriWindow).__TAURI_INTERNALS__;
  expect(() => new Function(forwardKeys)()).not.toThrow();
  (window as TauriWindow).__TAURI_INTERNALS__ = { invoke };
  window.addEventListener("keydown", pageListener);
});

const press = (target: Window, init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.document.body.dispatchEvent(event);
  return event;
};

test("loads before the Tauri internals exist, reading them only when a key is pressed", () => {
  press(window, { key: "ArrowRight" });

  expect(invoke).toHaveBeenLastCalledWith("forward_key", { key: expect.objectContaining({ key: "ArrowRight" }) });
  expect(pageListener).toHaveBeenCalled();
});

test("F11 toggles Fullscreen without reaching the page", () => {
  pageListener.mockClear();

  const event = press(window, { key: "F11" });

  expect(event.defaultPrevented).toBe(true);
  expect(pageListener).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenLastCalledWith("forward_key", { key: expect.objectContaining({ key: "F11" }) });
});

test("Ctrl+F11 stays with the page", () => {
  pageListener.mockClear();

  const event = press(window, { key: "F11", ctrlKey: true });

  expect(event.defaultPrevented).toBe(false);
  expect(pageListener).toHaveBeenCalled();
});

test("a framed page posts its keys to the Teleprompter without touching the Tauri internals", async () => {
  const frame = document.body.appendChild(document.createElement("iframe"));
  const framed = frame.contentWindow as Window & typeof globalThis & { forwardFromFramesOnly?: boolean };
  framed.forwardFromFramesOnly = true;
  new framed.Function(forwardKeys)();
  const posted = new Promise<MessageEvent>((resolve) => window.addEventListener("message", resolve, { once: true }));

  const event = press(framed, { key: "F11" });

  expect(event.defaultPrevented).toBe(true);
  expect((await posted).data.forwardedKey).toMatchObject({ key: "F11", target: { tag: "BODY" } });
});
