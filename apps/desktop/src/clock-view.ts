import type { ClockState, InsertionPoint, ScriptWord, StreamEvent } from "./session";

/** What the editor's clock control shows: folded from the Session's event stream. */
export interface ClockPanel {
  state: ClockState | null;
  scriptTime: number;
  speed: number;
  currentWord: { id: string; text: string } | null;
}

export const DISCONNECTED: ClockPanel = { state: null, scriptTime: 0, speed: 1, currentWord: null };

export function foldClock(panel: ClockPanel, event: StreamEvent): ClockPanel {
  switch (event.type) {
    case "snapshot":
      return { ...event.clock, currentWord: event.currentWord && { id: event.currentWord.id, text: event.currentWord.text } };
    case "clock": {
      const { state, scriptTime, speed } = event;
      return { state, scriptTime, speed, currentWord: state === "ready" ? null : panel.currentWord };
    }
    case "tick":
      return { ...panel, scriptTime: event.scriptTime };
    case "word":
      return { ...panel, currentWord: { id: event.id, text: event.text } };
    case "namedEvent":
      return panel;
    case "closed":
      return DISCONNECTED;
  }
}

export type ClockAction = "play" | "pause" | "reset";

/** What the one button does: play, pause, or in `ended` a restart, since play does nothing there. */
export function clockAction(state: ClockState | null): ClockAction | null {
  if (state === "ready" || state === "paused") return "play";
  if (state === "playing") return "pause";
  if (state === "ended") return "reset";
  return null;
}

export const ACTION_LABELS: Record<ClockAction, string> = { play: "Play", pause: "Pause", reset: "Restart" };

/** Where the clock is `elapsed` ms after it was last reported: running on while playing, never past Script End. */
export function clockPosition({ state, scriptTime, speed }: ClockPanel, elapsed: number, scriptEnd: number): number {
  return state === "playing" ? Math.min(scriptEnd, scriptTime + elapsed * speed) : scriptTime;
}

/** Where a Preview starts: the first selected Word, or the Word after the caret, or the start once the caret is at the end. */
export function previewFrom(words: ScriptWord[], selected: string[], caret: InsertionPoint): number {
  const id = selected[0] ?? caret.before;
  return words.find((word) => word.id === id)?.start ?? 0;
}
