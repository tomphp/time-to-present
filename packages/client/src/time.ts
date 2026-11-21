import type { Performance } from "./performance";
import type { Source } from "./source";
import type { Unsubscribe } from "./store";

export interface Time {
  /** The Script Time in integer ms: extrapolated while playing, frozen otherwise. */
  now(): number;
  /**
   * Calls `fn` with `now()` at once, on every animation frame while playing, and once on
   * any clock change.
   */
  onFrame(fn: (scriptTime: number) => void): Unsubscribe;
}

export function followTime(performance: Performance, source: Source): Time {
  const { clock } = performance;
  const handlers = new Set<(scriptTime: number) => void>();
  let anchor = { scriptTime: 0, at: source.now() };
  let cancelFrame: Unsubscribe | null = null;

  const now = () => {
    const { state, scriptTime, speed } = clock.get();
    if (state !== "playing") return scriptTime;
    return Math.round(anchor.scriptTime + (source.now() - anchor.at) * speed);
  };

  const render = () => {
    const scriptTime = now();
    for (const handler of [...handlers]) handler(scriptTime);
  };

  const stopFrames = () => {
    cancelFrame?.();
    cancelFrame = null;
  };

  const requestFrame = () => {
    if (cancelFrame || handlers.size === 0 || clock.get().state !== "playing") return;
    cancelFrame = source.frame(() => {
      cancelFrame = null;
      render();
      requestFrame();
    });
  };

  const anchorAt = (scriptTime: number) => {
    anchor = { scriptTime, at: source.now() };
  };

  clock.subscribe(({ scriptTime }) => {
    anchorAt(scriptTime);
    stopFrames();
    render();
    requestFrame();
  });
  performance.ticks.on(anchorAt);

  return {
    now,
    onFrame(fn) {
      const handler = (scriptTime: number) => fn(scriptTime);
      handlers.add(handler);
      handler(now());
      requestFrame();
      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) stopFrames();
      };
    },
  };
}
