import { channel, deliver } from "./channel.js";
import type { Source } from "./source.js";
import type { Unsubscribe } from "./store.js";
import type { StreamState } from "./stream-state.js";

/** The Script Time between clock changes, for smooth motion. */
export interface Time {
  /** The Script Time in integer ms: extrapolated while playing and never stepping back, frozen otherwise. */
  now(): number;
  /**
   * Calls `fn` with `now()` at once, on every animation frame while playing, and once on
   * any clock change.
   */
  onFrame(fn: (scriptTime: number) => void): Unsubscribe;
}

export function followTime(stream: StreamState, source: Source): Time {
  const { clock } = stream;
  const frames = channel<number>();
  let anchor = { scriptTime: 0, at: source.now() };
  let latest = 0;
  let cancelFrame: Unsubscribe | null = null;

  const now = () => {
    const { state, scriptTime, speed } = clock.get();
    if (state !== "playing") return scriptTime;
    latest = Math.max(latest, Math.round(anchor.scriptTime + (source.now() - anchor.at) * speed));
    return latest;
  };

  const notifyFrame = () => frames.emit(now());

  const stopFrames = () => {
    cancelFrame?.();
    cancelFrame = null;
  };

  const requestFrame = () => {
    if (cancelFrame || frames.size === 0 || clock.get().state !== "playing") return;
    cancelFrame = source.frame(() => {
      cancelFrame = null;
      notifyFrame();
      requestFrame();
    });
  };

  const anchorAt = (scriptTime: number) => {
    anchor = { scriptTime, at: source.now() };
  };

  clock.subscribe(({ scriptTime }) => {
    anchorAt(scriptTime);
    latest = scriptTime;
    stopFrames();
    notifyFrame();
    requestFrame();
  });
  stream.ticks.on(anchorAt);

  return {
    now,
    onFrame(fn) {
      const unsubscribe = frames.on(fn);
      deliver(fn, now());
      requestFrame();
      return () => {
        unsubscribe();
        if (frames.size === 0) stopFrames();
      };
    },
  };
}
