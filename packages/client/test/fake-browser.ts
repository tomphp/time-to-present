import { vi } from "vitest";

type Listener = (message: { data: string }) => void;

export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readyState = FakeEventSource.CONNECTING;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    browser.streams.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  send(type: string, payload: object) {
    this.readyState = FakeEventSource.OPEN;
    this.dispatch(type, { data: JSON.stringify(payload) });
  }

  drop(retrying: boolean) {
    this.readyState = retrying ? FakeEventSource.CONNECTING : FakeEventSource.CLOSED;
    this.dispatch("error", { data: "" });
  }

  get closed() {
    return this.readyState === FakeEventSource.CLOSED;
  }

  private dispatch(type: string, message: { data: string }) {
    for (const listener of this.listeners.get(type) ?? []) listener(message);
  }
}

interface Browser {
  streams: FakeEventSource[];
  fetched: string[];
  script: unknown;
  wall: number;
  frames: Map<number, () => void>;
  held: ((script: unknown) => void)[] | null;
}

const fresh = (): Browser => ({ streams: [], fetched: [], script: null, wall: 0, frames: new Map(), held: null });
const browser = fresh();

export function fakeBrowser() {
  Object.assign(browser, fresh());
  let nextFrame = 1;
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("location", { href: "http://localhost:4747/slides/" });
  vi.stubGlobal("performance", { now: () => browser.wall });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    browser.frames.set(nextFrame, callback);
    return nextFrame++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => browser.frames.delete(id));
  vi.stubGlobal("fetch", async (url: string) => {
    browser.fetched.push(url);
    const script = browser.held ? await new Promise((resolve) => browser.held!.push(resolve)) : browser.script;
    return { ok: script !== null, status: script === null ? 503 : 200, json: async () => script };
  });

  return {
    get stream() {
      return browser.streams.at(-1)!;
    },
    get streams() {
      return browser.streams;
    },
    get fetched() {
      return browser.fetched;
    },
    serveScript(script: unknown) {
      browser.script = script;
    },
    holdScripts() {
      browser.held = [];
    },
    respond(fetch: number, script: unknown) {
      browser.held![fetch](script);
    },
    advance(ms: number) {
      browser.wall += ms;
    },
    get pendingFrames() {
      return browser.frames.size;
    },
    runFrame() {
      const due = [...browser.frames.values()];
      browser.frames.clear();
      for (const callback of due) callback();
    },
  };
}
