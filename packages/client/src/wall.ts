import type { Unsubscribe } from "./store.js";

/** The wall time a Simulator runs its clock over, in integer ms, and its animation frames. */
export interface Wall {
  now(): number;
  frame(callback: () => void): Unsubscribe;
  /** Keeps the clock running on its own while `playing`, as the desktop app's poll does. */
  drive(playing: boolean): void;
}

export interface ManualWall extends Wall {
  advance(ms: number): void;
}

const RUN_EVERY_MS = 20;

export function realWall(runClock: () => void): Wall {
  let timer: ReturnType<typeof setInterval> | undefined;
  return {
    now: () => Math.floor(performance.now()),
    frame(callback) {
      const id = requestAnimationFrame(() => callback());
      return () => cancelAnimationFrame(id);
    },
    drive(playing) {
      if (playing && timer === undefined) timer = setInterval(runClock, RUN_EVERY_MS);
      if (!playing && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}

/** Stands still until `advance(ms)`, which runs the clock once and then the frames due. */
export function manualWall(runClock: () => void): ManualWall {
  let wall = 0;
  const frames = new Set<() => void>();
  return {
    now: () => wall,
    frame(callback) {
      const frame = () => callback();
      frames.add(frame);
      return () => frames.delete(frame);
    },
    drive() {},
    advance(ms) {
      wall += ms;
      runClock();
      const due = [...frames];
      frames.clear();
      for (const frame of due) frame();
    },
  };
}
