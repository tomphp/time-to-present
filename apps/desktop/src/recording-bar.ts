import {
  cancelRecording,
  closeRecordingBar,
  onMeter,
  openRecordingBar,
  selectInput,
  startRecording,
  stopRecording,
} from "./commands";
import { channelOptions, escapeAction, formatElapsed, inputOptions, meterFill, shortcut } from "./recording-bar-view";
import type { RecordingBarState } from "./session";

const find = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

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
const error = find<HTMLParagraphElement>("#error");

let bar: RecordingBarState | null = null;
let recorded = 0;

function showError(reason: unknown) {
  error.textContent = String(reason);
  error.hidden = false;
}

const act = (command: () => Promise<void>) => () => {
  error.hidden = true;
  command().catch(showError);
};

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

export function renderRecordingBar(state: RecordingBarState | null) {
  const wasRecording = bar?.recording ?? false;
  bar = state;
  section.hidden = state === null;
  record.disabled = state !== null;
  if (state === null) return;
  const granted = state.access === "granted";
  denied.hidden = granted;
  controls.hidden = !granted;
  notice.hidden = state.notice === null;
  notice.textContent = state.notice ?? "";
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
  start.disabled = state.recording || state.input === null;
  stop.disabled = cancel.disabled = !state.recording;
  close.disabled = state.recording;
  if (state.recording && !wasRecording) {
    recorded = 0;
    elapsed.textContent = formatElapsed(0);
    setClipped(false);
  }
  if (!state.recording) setConfirming(false);
}

const chooseInput = act(() =>
  selectInput({ device: device.value || null, channel: Number(channel.value) || 1 }),
);

function requestCancel() {
  const action = escapeAction(bar?.recording ?? false, recorded, !confirmCancel.hidden);
  if (action === "cancel") act(cancelRecording)();
  if (action === "confirm") setConfirming(true);
  if (action === "keep") setConfirming(false);
}

async function toggleRecording() {
  if (bar === null) {
    await openRecordingBar();
    return startRecording();
  }
  return bar.recording ? stopRecording() : startRecording();
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

device.addEventListener("change", () => {
  channel.value = "1";
  chooseInput();
});
channel.addEventListener("change", chooseInput);
clip.addEventListener("click", () => setClipped(false));
start.addEventListener("click", act(startRecording));
stop.addEventListener("click", act(stopRecording));
cancel.addEventListener("click", requestCancel);
find("#discard-recording").addEventListener("click", act(cancelRecording));
find("#keep-recording").addEventListener("click", () => setConfirming(false));
close.addEventListener("click", act(closeRecordingBar));
record.addEventListener("click", act(openRecordingBar));

document.addEventListener("keydown", (event) => {
  const key = shortcut(event);
  if (key === null) return;
  event.preventDefault();
  if (key === "toggle") act(toggleRecording)();
  if (key === "escape") requestCancel();
});
