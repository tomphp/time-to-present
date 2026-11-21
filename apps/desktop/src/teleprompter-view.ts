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
      return { ...heard(followed, event.clock, at), jumps: followed.jumps + 1 };
    case "clock":
      return { ...heard(followed, event, at), jumps: followed.jumps + (event.cause === "reset" ? 1 : 0) };
    case "tick":
      return { ...followed, anchor: { scriptTime: event.scriptTime, at }, floor: scriptTimeAt(followed, at) };
    case "word":
    case "namedEvent":
      return followed;
    case "closed":
      return { ...UNFOLLOWED, jumps: followed.jumps };
  }
}

const heard = (followed: Followed, { state, speed, scriptTime }: ClockView, at: number) => ({
  state,
  speed,
  anchor: { scriptTime, at: stillEnded(followed, state) ? followed.anchor.at : at },
  floor: scriptTime,
});

const stillEnded = (followed: Followed, state: ClockState) => followed.state === "ended" && state === "ended";

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

const ENDING_DELAY = 1000;

/** A second after the clock ends, when the last Word dims and the END marker moves onto the Reading Line. */
export const isOver = ({ state, anchor }: Followed, at: number) => state === "ended" && at - anchor.at >= ENDING_DELAY;

/**
 * The top of the line the column holds on the Reading Line, how far the presenter has scrolled past it,
 * and whether moving there eases or jumps.
 */
export interface Scroll {
  top: number;
  free: number;
  jumps: number;
  animate: boolean;
}

/** Eases a line at a time and on snapping back, follows free scrolling at once, and jumps after a seek or reset. */
export function scrollTo(previous: Scroll | null, { top, free, jumps }: Omit<Scroll, "animate">): Scroll {
  if (previous?.top === top && previous.free === free && previous.jumps === jumps) return previous;
  const scrolling = previous !== null && free !== 0 && previous.free !== free;
  return { top, free, jumps, animate: previous?.jumps === jumps && !scrolling };
}

/** How far the presenter has scrolled from the Reading Line while the clock stands still. */
export interface FreeScroll {
  offset: number;
  jumps: number;
}

const scrollsFreely = (state: ClockState | null) => state === "ready" || state === "paused";

export function scrollFreely(
  free: FreeScroll | null,
  followed: Pick<Followed, "state" | "jumps">,
  delta: number,
  range: { min: number; max: number },
): FreeScroll | null {
  if (!scrollsFreely(followed.state)) return null;
  const offset = (heldFreeScroll(free, followed)?.offset ?? 0) + delta;
  return { offset: Math.min(range.max, Math.max(range.min, offset)), jumps: followed.jumps };
}

/** Free scrolling lasts until play or a seek. */
export const heldFreeScroll = (free: FreeScroll | null, { state, jumps }: Pick<Followed, "state" | "jumps">) =>
  free && free.jumps === jumps && scrollsFreely(state) ? free : null;

const PLAY_PAUSE_KEYS = new Set([" ", "PageDown", "ArrowRight"]);

export function keyCommand(key: string, state: ClockState | null): "play" | "pause" | null {
  const action = PLAY_PAUSE_KEYS.has(key) ? clockAction(state) : null;
  return action === "reset" ? null : action;
}

export const isPerformShortcut = ({ key, metaKey, shiftKey }: { key: string; metaKey: boolean; shiftKey: boolean }) =>
  metaKey && shiftKey && key.toLowerCase() === "p";
