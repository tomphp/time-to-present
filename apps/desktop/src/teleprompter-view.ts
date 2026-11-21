import { clockAction } from "./clock-view";
import type { ClockState, ClockView, ScriptWord, StreamEvent } from "./session";

/**
 * The clock as the Teleprompter follows it: the last Script Time heard, the wall time it was heard
 * at, a floor that a tick behind the extrapolation can't take it below, and a count of the jumps
 * (Snapshots and resets) that moved it without playing there.
 */
export interface Followed {
  state: ClockState | null;
  speed: number;
  anchor: { scriptTime: number; at: number };
  floor: number;
  jumps: number;
}

export const UNFOLLOWED: Followed = { state: null, speed: 1, anchor: { scriptTime: 0, at: 0 }, floor: 0, jumps: 0 };

export function followClock(followed: Followed, event: StreamEvent, at: number): Followed {
  switch (event.type) {
    case "snapshot":
      return { ...heard(event.clock, at), jumps: followed.jumps + 1 };
    case "clock":
      return { ...heard(event, at), jumps: followed.jumps + (event.cause === "reset" ? 1 : 0) };
    case "tick":
      return { ...followed, anchor: { scriptTime: event.scriptTime, at }, floor: scriptTimeAt(followed, at) };
    case "word":
    case "namedEvent":
      return followed;
    case "closed":
      return { ...UNFOLLOWED, jumps: followed.jumps };
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

/** The top of the line the column holds on the Reading Line, and whether moving to it eases or jumps. */
export interface Scroll {
  top: number;
  jumps: number;
  animate: boolean;
}

/** Eases a line at a time as the Words cross onto a new line, and jumps after a seek or reset. */
export function scrollTo(previous: Scroll | null, top: number, jumps: number): Scroll {
  if (previous?.top === top && previous.jumps === jumps) return previous;
  return { top, jumps, animate: previous?.jumps === jumps };
}

const PLAY_PAUSE_KEYS = new Set([" ", "PageDown", "ArrowRight"]);

export function keyCommand(key: string, state: ClockState | null): "play" | "pause" | null {
  const action = PLAY_PAUSE_KEYS.has(key) ? clockAction(state) : null;
  return action === "reset" ? null : action;
}

export const isPerformShortcut = ({ key, metaKey, shiftKey }: { key: string; metaKey: boolean; shiftKey: boolean }) =>
  metaKey && shiftKey && key.toLowerCase() === "p";
