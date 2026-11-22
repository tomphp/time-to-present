import { ACTION_LABELS, clockAction, DISCONNECTED, foldClock, type ClockAction, type ClockPanel } from "./clock-view";
import { onStreamEvent, pause, preview, reset } from "./commands";
import { formatElapsed } from "./recording-bar-view";
import { find } from "./dom";
import { act } from "./report-error";
import type { StreamEvent } from "./session";

export interface ClockCommands extends Record<ClockAction, () => Promise<void>> {
  onStreamEvent(render: (event: StreamEvent) => void): void;
}

/** Playing from the editor is a Preview from where the clock stands, so it sounds. */
const CLOCK_COMMANDS: ClockCommands = { play: () => preview(null), pause, reset, onStreamEvent };

/**
 * The editor is a client of the stream like any other: it starts, and restarts, from a Snapshot.
 * `follow` hears each event with the clock as it now stands.
 */
export function mountClockControl(
  follow: (panel: ClockPanel, event: StreamEvent) => void,
  commands: ClockCommands = CLOCK_COMMANDS,
) {
  const button = find<HTMLButtonElement>("#play-pause");
  const state = find<HTMLSpanElement>("#clock-state");
  const elapsed = find<HTMLSpanElement>("#clock-elapsed");
  const currentWord = find<HTMLSpanElement>("#current-word");
  let panel = DISCONNECTED;
  let action: ClockAction | null = null;

  function render() {
    action = clockAction(panel.state);
    button.textContent = ACTION_LABELS[action ?? "play"];
    button.disabled = action === null;
    state.textContent = panel.state ?? "";
    elapsed.textContent = formatElapsed(panel.scriptTime);
    currentWord.textContent = panel.currentWord?.text ?? "";
  }

  /** Runs what the button offers now, if it is one of `offered`. */
  const press =
    (...offered: ClockAction[]) =>
    () => {
      if (action && offered.includes(action)) act(commands[action])();
    };

  button.addEventListener("click", press("play", "pause", "reset"));
  render();
  commands.onStreamEvent((event) => {
    panel = foldClock(panel, event);
    render();
    follow(panel, event);
  });
  return { playPause: press("play", "pause"), restart: press("reset") };
}
