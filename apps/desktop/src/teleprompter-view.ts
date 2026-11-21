import type { ClockState, ClockView, ScriptWord, StreamEvent } from "./session";

/**
 * The clock as the Teleprompter follows it: the last Script Time heard, the wall time it was heard
 * at, a floor that a tick behind the extrapolation can't take it below, and a count of the
 * Snapshots that moved it without playing there.
 */
export interface Followed {
  state: ClockState | null;
  speed: number;
  anchor: { scriptTime: number; at: number };
  floor: number;
  seeks: number;
}

export const UNFOLLOWED: Followed = { state: null, speed: 1, anchor: { scriptTime: 0, at: 0 }, floor: 0, seeks: 0 };

export function followClock(followed: Followed, event: StreamEvent, at: number): Followed {
  switch (event.type) {
    case "snapshot":
      return { ...heard(event.clock, at), seeks: followed.seeks + 1 };
    case "clock":
      return { ...heard(event, at), seeks: followed.seeks };
    case "tick":
      return { ...followed, anchor: { scriptTime: event.scriptTime, at }, floor: scriptTimeAt(followed, at) };
    case "word":
    case "namedEvent":
      return followed;
    case "closed":
      return { ...UNFOLLOWED, seeks: followed.seeks };
  }
}

const heard = ({ state, speed, scriptTime }: ClockView, at: number) => ({
  state,
  speed,
  anchor: { scriptTime, at },
  floor: scriptTime,
});

/** Script Time at wall time `at`: extrapolated while playing and never stepping back, frozen otherwise. */
export function scriptTimeAt({ state, speed, anchor, floor }: Followed, at: number) {
  if (state !== "playing") return anchor.scriptTime;
  return Math.max(floor, Math.round(anchor.scriptTime + (at - anchor.at) * speed));
}

/** The index of the Word being spoken: the last to have started, and none before play. */
export function currentWord(words: Pick<ScriptWord, "start">[], state: ClockState | null, scriptTime: number) {
  if (state === null || state === "ready") return null;
  const upcoming = words.findIndex((word) => word.start > scriptTime);
  const current = (upcoming === -1 ? words.length : upcoming) - 1;
  return current < 0 ? null : current;
}

export type WordLook = "spoken" | "current" | "upcoming";

export function wordLook(index: number, current: number | null): WordLook {
  if (current === null || index > current) return "upcoming";
  return index === current ? "current" : "spoken";
}

/** Which line the column holds on the Reading Line, and whether moving to it eases or jumps. */
export interface Scroll {
  line: number;
  seeks: number;
  animate: boolean;
}

/** Eases a line at a time as the Words cross onto a new line, and jumps after a seek. */
export function scrollTo(previous: Scroll | null, line: number, seeks: number): Scroll {
  if (previous?.line === line && previous.seeks === seeks) return previous;
  return { line, seeks, animate: previous?.seeks === seeks };
}

const PLAY_PAUSE_KEYS = new Set([" ", "PageDown", "ArrowRight"]);

/** What a Performance key does to the clock: play/pause, and nothing once ended. */
export function keyCommand(key: string, state: ClockState | null): "play" | "pause" | null {
  if (!PLAY_PAUSE_KEYS.has(key)) return null;
  if (state === "playing") return "pause";
  return state === "ready" || state === "paused" ? "play" : null;
}

export const isPerformShortcut = ({ key, metaKey, shiftKey }: { key: string; metaKey: boolean; shiftKey: boolean }) =>
  metaKey && shiftKey && key.toLowerCase() === "p";
