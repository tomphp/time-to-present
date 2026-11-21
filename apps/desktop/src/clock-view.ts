import type { ClockState, StreamEvent } from "./session";

/** What the editor's clock control shows: folded from the Session's event stream. */
export interface ClockPanel {
  state: ClockState | null;
  scriptTime: number;
  speed: number;
  currentWord: string | null;
}

export const DISCONNECTED: ClockPanel = { state: null, scriptTime: 0, speed: 1, currentWord: null };

export function foldClock(panel: ClockPanel, event: StreamEvent): ClockPanel {
  switch (event.type) {
    case "snapshot":
      return { ...event.clock, currentWord: event.currentWord?.text ?? null };
    case "clock": {
      const { state, scriptTime, speed } = event;
      return { state, scriptTime, speed, currentWord: state === "ready" ? null : panel.currentWord };
    }
    case "tick":
      return { ...panel, scriptTime: event.scriptTime };
    case "word":
      return { ...panel, currentWord: event.text };
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
