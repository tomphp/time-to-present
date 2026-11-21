import type { ClockState, ScriptWord } from "./session";

/** The per-machine switch, and the Gap in milliseconds from which the cue counts down. */
export interface ApproachCueSettings {
  enabled: boolean;
  longGap: number;
}

/** The Word being approached, how much of its Gap has gone, and whole seconds left on a Long Gap. */
export interface Cue {
  word: number;
  fill: number;
  countdown: number | null;
}

const SHORTEST_FILLED_GAP = 100;

export function approachCue(
  words: Pick<ScriptWord, "start" | "gap">[],
  { state, speed }: { state: ClockState | null; speed: number },
  scriptTime: number,
  { enabled, longGap }: ApproachCueSettings,
): Cue | null {
  if (!enabled || (state !== "playing" && state !== "paused")) return null;
  const word = words.findIndex((next) => next.start > scriptTime);
  if (word === -1) return null;
  const { start, gap } = words[word];
  const gapStart = start - gap;
  if (gap < SHORTEST_FILLED_GAP || scriptTime < gapStart) return null;
  return {
    word,
    fill: (scriptTime - gapStart) / gap,
    countdown: gap >= longGap ? Math.ceil((start - scriptTime) / speed / 1000) : null,
  };
}

const LONG_GAP_SECONDS = { min: 0.1, max: 3600 };

export function longGapFromSeconds(text: string) {
  if (text.trim() === "") return null;
  const seconds = Number(text);
  const inRange = seconds >= LONG_GAP_SECONDS.min && seconds <= LONG_GAP_SECONDS.max;
  return inRange ? Math.round(seconds * 1000) : null;
}
