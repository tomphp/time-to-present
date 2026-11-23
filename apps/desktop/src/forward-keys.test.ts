// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import forwardKeys from "../src-tauri/src/forward-keys.js?raw";

type InjectedWindow = Window &
  typeof globalThis & {
    __TAURI_INTERNALS__?: { invoke: (command: string, args: unknown) => Promise<void> };
    forwardFromFramesOnly?: boolean;
  };

const invoke = vi.fn(() => Promise.resolve());
const pageListener = vi.fn();
const top = window as InjectedWindow;
let loadError: unknown;

delete top.__TAURI_INTERNALS__;
try {
  new Function(forwardKeys)();
} catch (error) {
  loadError = error;
}
top.__TAURI_INTERNALS__ = { invoke };
top.addEventListener("keydown", pageListener);

beforeEach(() => vi.clearAllMocks());
afterEach(() => document.body.replaceChildren());

const press = (target: Window, init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.document.body.dispatchEvent(event);
  return event;
};

const forwarded = (key: string) => ["forward_key", { key: expect.objectContaining({ key }) }];

test("loads before the Tauri internals exist, reading them only when a key is pressed", () => {
  press(top, { key: "ArrowRight" });

  expect(loadError).toBeUndefined();
  expect(invoke).toHaveBeenCalledWith(...forwarded("ArrowRight"));
  expect(pageListener).toHaveBeenCalled();
});

test("F11 toggles Fullscreen without reaching the page", () => {
  const event = press(top, { key: "F11" });

  expect(event.defaultPrevented).toBe(true);
  expect(pageListener).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledWith(...forwarded("F11"));
});

test("Ctrl+F11 is forwarded and stays with the page", () => {
  const event = press(top, { key: "F11", ctrlKey: true });

  expect(event.defaultPrevented).toBe(false);
  expect(pageListener).toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledWith(...forwarded("F11"));
});

test("a framed page posts its keys to the Teleprompter without touching the Tauri internals", async () => {
  const framed = document.body.appendChild(document.createElement("iframe")).contentWindow as InjectedWindow;
  framed.forwardFromFramesOnly = true;
  new framed.Function(forwardKeys)();
  const posted = new Promise<MessageEvent>((resolve) => top.addEventListener("message", resolve, { once: true }));

  const event = press(framed, { key: "F11" });

  expect(event.defaultPrevented).toBe(true);
  expect(invoke).not.toHaveBeenCalled();
  expect((await posted).data.forwardedKey).toMatchObject({ key: "F11", target: { tag: "BODY" } });
});
