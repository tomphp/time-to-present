import type { IconButtonOptions } from "./icon-button";
import type { ClockState, StreamEvent } from "./session";

export interface CurrentWord {
  id: string;
  text: string;
}

/** What the editor's clock control shows: folded from the Session's event stream. */
export interface ClockPanel {
  state: ClockState | null;
  scriptTime: number;
  speed: number;
  currentWord: CurrentWord | null;
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

export const ACTION_BUTTONS: Record<ClockAction, IconButtonOptions> = {
  play: { icon: "play", label: "Play from where the clock stands" },
  pause: { icon: "pause", label: "Pause" },
  reset: { icon: "restart", label: "Restart" },
};

/** Where the clock is `elapsed` ms after it was last reported: running on while playing, never past Script End. */
export function clockPosition({ state, scriptTime, speed }: ClockPanel, elapsed: number, scriptEnd: number): number {
  return state === "playing" ? Math.min(scriptEnd, scriptTime + elapsed * speed) : scriptTime;
}
