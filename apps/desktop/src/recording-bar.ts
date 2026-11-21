import {
  cancelRecording,
  closeRecordingBar,
  onMeter,
  openRecordingBar,
  selectChannel,
  selectInput,
  startRecordingAt,
  stopRecording,
} from "./commands";
import {
  barNotice,
  canStart,
  channelOptions,
  escapeAction,
  formatElapsed,
  inputOptions,
  meterFill,
  shortcut,
} from "./recording-bar-view";
import { find } from "./dom";
import type { RecordingTarget } from "./recording-target";
import { act } from "./report-error";
import type { RecordingBarState } from "./session";

const section = find<HTMLElement>("#recording-bar");
const denied = find<HTMLParagraphElement>("#recording-denied");
const notice = find<HTMLParagraphElement>("#recording-notice");
const controls = find<HTMLDivElement>("#recording-controls");
const device = find<HTMLSelectElement>("#input-device");
const channel = find<HTMLSelectElement>("#input-channel");
const fill = find<HTMLDivElement>("#meter-fill");
const clip = find<HTMLButtonElement>("#clip");
const elapsed = find<HTMLSpanElement>("#elapsed");
const start = find<HTMLButtonElement>("#start-recording");
const stop = find<HTMLButtonElement>("#stop-recording");
const cancel = find<HTMLButtonElement>("#cancel-recording");
const confirmCancel = find<HTMLParagraphElement>("#confirm-cancel");
const close = find<HTMLButtonElement>("#close-recording-bar");
const record = find<HTMLButtonElement>("#record");
const level = find<HTMLDivElement>(".meter");

let bar: RecordingBarState | null = null;
let recorded = 0;

function setClipped(clipped: boolean) {
  clip.classList.toggle("lit", clipped);
}

function setConfirming(confirming: boolean) {
  confirmCancel.hidden = !confirming;
  if (confirming) find<HTMLButtonElement>("#discard-recording").focus();
}

function options(select: HTMLSelectElement, items: { value: string; label: string; selected: boolean }[]) {
  select.replaceChildren(
    ...items.map(({ value, label, selected }) => new Option(label, value, selected, selected)),
  );
}

function renderRecordingBar(state: RecordingBarState | null) {
  const wasRecording = bar?.recording ?? false;
  bar = state;
  section.hidden = state === null;
  record.disabled = state !== null;
  if (state === null) return;
  const granted = state.access === "granted";
  denied.hidden = granted;
  controls.hidden = !granted;
  const message = barNotice(state);
  notice.hidden = message === null;
  notice.textContent = message ?? "";
  options(device, inputOptions(state));
  options(
    channel,
    channelOptions(state).map((number) => ({
      value: String(number),
      label: String(number),
      selected: number === state.input?.choice.channel,
    })),
  );
  device.disabled = channel.disabled = state.recording;
  start.disabled = !canStart(state);
  stop.disabled = cancel.disabled = !state.recording;
  close.disabled = state.recording;
  if (state.recording && !wasRecording) {
    recorded = 0;
    elapsed.textContent = formatElapsed(0);
    setClipped(false);
  }
  if (!state.recording) setConfirming(false);
}


function requestCancel() {
  const action = escapeAction(bar?.recording ?? false, recorded, !confirmCancel.hidden);
  if (action === "cancel") act(cancelRecording)();
  if (action === "confirm") setConfirming(true);
  if (action === "keep") setConfirming(false);
}

/** The recording bar, starting each Recording where the editor reports: over a selection, or at the Insertion Point. */
export function mountRecordingBar(target: () => RecordingTarget) {
  const startHere = () => startRecordingAt(target());

  async function toggleRecording() {
    if (bar === null) {
      await openRecordingBar();
      return startHere();
    }
    return bar.recording ? stopRecording() : startHere();
  }

  start.addEventListener("click", act(startHere));
  document.addEventListener("keydown", (event) => {
    const key = shortcut(event);
    if (key === null) return;
    event.preventDefault();
    if (key === "toggle") act(toggleRecording)();
    if (key === "escape") requestCancel();
  });
  return { render: renderRecordingBar };
}

onMeter(({ peak, clipped, recorded: ms }) => {
  fill.style.width = `${meterFill(peak) * 100}%`;
  level.setAttribute("aria-valuenow", String(meterFill(peak)));
  if (clipped) setClipped(true);
  if (ms !== null) {
    recorded = ms;
    elapsed.textContent = formatElapsed(ms);
  }
});

device.addEventListener("change", act(() => selectInput({ device: device.value || null, channel: 1 })));
channel.addEventListener("change", act(() => selectChannel(Number(channel.value))));
clip.addEventListener("click", () => setClipped(false));
stop.addEventListener("click", act(stopRecording));
cancel.addEventListener("click", requestCancel);
find("#discard-recording").addEventListener("click", act(cancelRecording));
find("#keep-recording").addEventListener("click", () => setConfirming(false));
close.addEventListener("click", act(closeRecordingBar));
record.addEventListener("click", act(openRecordingBar));
