import { ACTION_LABELS, clockAction, DISCONNECTED, foldClock, type ClockAction, type ClockPanel } from "./clock-view";
import { onStreamEvent, pause, preview, reset } from "./commands";
import { formatElapsed } from "./recording-bar-view";
import { find } from "./dom";
import { act } from "./report-error";
import type { StreamEvent } from "./session";

const button = find<HTMLButtonElement>("#play-pause");
const state = find<HTMLSpanElement>("#clock-state");
const elapsed = find<HTMLSpanElement>("#clock-elapsed");
const currentWord = find<HTMLSpanElement>("#current-word");

/** Playing from the editor is a Preview from where the clock stands, so it sounds. */
const commands: Record<ClockAction, () => Promise<void>> = { play: () => preview(null), pause, reset };

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

button.addEventListener("click", () => {
  if (action) act(commands[action])();
});

/**
 * The editor is a client of the stream like any other: it starts, and restarts, from a Snapshot.
 * `follow` hears each event with the clock as it now stands.
 */
export function mountClockControl(follow: (panel: ClockPanel, event: StreamEvent) => void) {
  render();
  onStreamEvent((event) => {
    panel = foldClock(panel, event);
    render();
    follow(panel, event);
  });
}
