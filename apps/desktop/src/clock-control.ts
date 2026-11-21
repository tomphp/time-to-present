import { ACTION_LABELS, clockAction, DISCONNECTED, foldClock, type ClockAction } from "./clock-view";
import { onStreamEvent, pause, play, reset } from "./commands";
import { formatElapsed } from "./recording-bar-view";
import { find } from "./dom";
import { act } from "./report-error";

const button = find<HTMLButtonElement>("#play-pause");
const state = find<HTMLSpanElement>("#clock-state");
const elapsed = find<HTMLSpanElement>("#clock-elapsed");
const currentWord = find<HTMLSpanElement>("#current-word");

const commands: Record<ClockAction, () => Promise<void>> = { play, pause, reset };

let panel = DISCONNECTED;
let action: ClockAction | null = null;

function render() {
  action = clockAction(panel.state);
  button.textContent = ACTION_LABELS[action ?? "play"];
  button.disabled = action === null;
  state.textContent = panel.state ?? "";
  elapsed.textContent = formatElapsed(panel.scriptTime);
  currentWord.textContent = panel.currentWord ?? "";
}

button.addEventListener("click", () => {
  if (action) act(commands[action])();
});

/** The editor is a client of the stream like any other: it starts, and restarts, from a Snapshot. */
export function mountClockControl() {
  render();
  onStreamEvent((event) => {
    panel = foldClock(panel, event);
    render();
  });
}
