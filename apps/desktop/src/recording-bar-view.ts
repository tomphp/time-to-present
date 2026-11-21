import type { RecordingBarState } from "./session";

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
  return Array.from({ length: input?.input.channels ?? 0 }, (_, index) => index + 1);
}
