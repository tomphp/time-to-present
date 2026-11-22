import { STREAM_EVENT_TYPES, type StreamEvent } from "./protocol.js";
import type { Unsubscribe } from "./store.js";

/** What a Source tells the Client it is following. */
export interface SourceListener {
  event(event: StreamEvent): void;
  /** The stream dropped and the Source is trying to get it back. */
  lost(): void;
}

/**
 * Where a Client gets the Performance from: the desktop app's event stream by default, or
 * a Simulator. It also sets the Client's time base, so a manual-clock Simulator can make
 * `now()` and `onFrame` deterministic.
 */
export interface Source {
  /** Starts delivering the stream to `listener`, until the returned function stops it. */
  open(listener: SourceListener): Unsubscribe;
  /** The Script in the `/_ttp/v1/script` shape. */
  script(): Promise<unknown>;
  /** Wall time in ms. */
  now(): number;
  /** Calls `callback` on the next animation frame, unless cancelled first. */
  frame(callback: () => void): Unsubscribe;
}

const RECONNECT_MS = 1000;

export function eventStream(url: string): Source {
  const eventsUrl = new URL(url, globalThis.location?.href).href;
  return {
    open: (listener) => follow(eventsUrl, listener),
    async script() {
      const response = await fetch(new URL("script", eventsUrl).href);
      if (!response.ok) throw new Error(`The Script could not be fetched: HTTP ${response.status}`);
      return response.json();
    },
    now: () => performance.now(),
    frame(callback) {
      const id = requestAnimationFrame(() => callback());
      return () => cancelAnimationFrame(id);
    },
  };
}

function follow(url: string, listener: SourceListener): Unsubscribe {
  let stream: EventSource;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const start = () => {
    stream = new EventSource(url);
    for (const type of STREAM_EVENT_TYPES) {
      stream.addEventListener(type, (message) => listener.event({ ...JSON.parse(message.data), type }));
    }
    stream.addEventListener("error", () => {
      listener.lost();
      if (stream.readyState === EventSource.CLOSED) retry = setTimeout(start, RECONNECT_MS);
    });
  };

  start();
  return () => {
    clearTimeout(retry);
    stream.close();
  };
}
