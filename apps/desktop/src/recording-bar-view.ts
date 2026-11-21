import type { LiveModel, RecordingBarState } from "./session";

export const CONFIRM_CANCEL_AFTER_MS = 3_000;
const METER_FLOOR_DB = -60;

export function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function meterFill(peak: number) {
  if (peak <= 0) return 0;
  const db = 20 * Math.log10(peak);
  return Math.min(1, Math.max(0, 1 - db / METER_FLOOR_DB));
}

export function shortcut({ key, metaKey }: { key: string; metaKey: boolean }) {
  if (metaKey && key.toLowerCase() === "r") return "toggle";
  if (key === "Escape") return "escape";
  return null;
}

export function escapeAction(recording: boolean, recordedMs: number, confirming: boolean) {
  if (!recording) return "none";
  if (confirming) return "keep";
  return recordedMs < CONFIRM_CANCEL_AFTER_MS ? "cancel" : "confirm";
}

export function inputOptions({ inputs, input }: RecordingBarState) {
  const chosen = input?.choice.device ?? "";
  return [{ value: "", label: "System default" }, ...inputs.map(({ name }) => ({ value: name, label: name }))].map(
    (option) => ({ ...option, selected: option.value === chosen }),
  );
}

export function channelOptions({ input }: RecordingBarState) {
  return Array.from({ length: input?.device.channels ?? 0 }, (_, index) => index + 1);
}

/** A Recording waits for the live model to be fetched, but not on one that could not be. */
export function canStart({ recording, input, liveModel }: RecordingBarState) {
  return !recording && input !== null && liveModel.kind !== "fetching";
}

/** What the bar has to tell the presenter, if anything. */
export function barNotice({ notice, liveModel }: RecordingBarState): string | null {
  const notices = [notice, liveModelNotice(liveModel)].filter((text) => text !== null);
  return notices.length ? notices.join(" ") : null;
}

export function liveModelNotice(model: LiveModel): string | null {
  switch (model.kind) {
    case "ready":
      return null;
    case "fetching":
      return model.percent === null ? "Fetching the live speech model…" : `Fetching the live speech model… ${model.percent}%`;
    case "failed":
      return `No Live Transcript: ${model.reason}`;
  }
}
