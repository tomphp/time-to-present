import type { ScriptWord, TimedEvent } from "./session";

export interface Mirror {
  horizontal: boolean;
  vertical: boolean;
}

/** What the presenter tunes for their rig; remembered on this machine, with the mirror kept per display. */
export interface DisplayOptions {
  markers: boolean;
  fontSize: number;
  readingLine: number;
  mirrors: Record<string, Mirror>;
}

export const DEFAULT_OPTIONS: DisplayOptions = { markers: true, fontSize: 48, readingLine: 1 / 3, mirrors: {} };
export const NOT_MIRRORED: Mirror = { horizontal: false, vertical: false };

const FONT_SIZES = { min: 16, max: 160, step: 4 };
const READING_LINE = { min: 0.1, max: 0.9, step: 0.05 };
const STORAGE_KEY = "teleprompter-display-options";

export type DisplayAction =
  | "blank"
  | "markers"
  | "mirror"
  | "flip"
  | "fontLarger"
  | "fontSmaller"
  | "readingLineUp"
  | "readingLineDown";

interface Keys {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const PLAIN_KEYS: Record<string, DisplayAction> = { b: "blank", ".": "blank", e: "markers", m: "mirror" };
const COMMAND_KEYS: Record<string, DisplayAction> = {
  "+": "fontLarger",
  "=": "fontLarger",
  "-": "fontSmaller",
  ArrowUp: "readingLineUp",
  ArrowDown: "readingLineDown",
};

export function displayAction({ key, metaKey, ctrlKey, altKey, shiftKey }: Keys): DisplayAction | null {
  if (ctrlKey || altKey) return null;
  if (metaKey) return COMMAND_KEYS[key] ?? null;
  if (shiftKey && key.toLowerCase() === "m") return "flip";
  return shiftKey ? null : (PLAIN_KEYS[key.toLowerCase()] ?? null);
}

const clamp = (value: number, { min, max }: { min: number; max: number }) =>
  Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;

export function applyAction(options: DisplayOptions, action: DisplayAction, display: string): DisplayOptions {
  const mirror = mirrorFor(options, display);
  switch (action) {
    case "markers":
      return { ...options, markers: !options.markers };
    case "mirror":
      return withMirror(options, display, { ...mirror, horizontal: !mirror.horizontal });
    case "flip":
      return withMirror(options, display, { ...mirror, vertical: !mirror.vertical });
    case "fontLarger":
      return { ...options, fontSize: clamp(options.fontSize + FONT_SIZES.step, FONT_SIZES) };
    case "fontSmaller":
      return { ...options, fontSize: clamp(options.fontSize - FONT_SIZES.step, FONT_SIZES) };
    case "readingLineUp":
      return { ...options, readingLine: clamp(options.readingLine - READING_LINE.step, READING_LINE) };
    case "readingLineDown":
      return { ...options, readingLine: clamp(options.readingLine + READING_LINE.step, READING_LINE) };
    case "blank":
      return options;
  }
}

export const mirrorFor = (options: DisplayOptions, display: string) => options.mirrors[display] ?? NOT_MIRRORED;

const withMirror = (options: DisplayOptions, display: string, mirror: Mirror): DisplayOptions => ({
  ...options,
  mirrors: { ...options.mirrors, [display]: mirror },
});

export const mirrorTransform = ({ horizontal, vertical }: Mirror) =>
  `scale(${horizontal ? -1 : 1}, ${vertical ? -1 : 1})`;

export function loadOptions(storage: Pick<Storage, "getItem">): DisplayOptions {
  try {
    return { ...DEFAULT_OPTIONS, ...JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export const saveOptions = (storage: Pick<Storage, "setItem">, options: DisplayOptions) =>
  storage.setItem(STORAGE_KEY, JSON.stringify(options));

/** For each Named Event, the index of the Word it sits before: the first to start at or after it, or the Script's end. */
export function markerPlacements(words: Pick<ScriptWord, "start">[], events: Pick<TimedEvent, "id" | "name" | "time">[]) {
  return events.map(({ id, name, time }) => {
    const index = words.findIndex((word) => word.start >= time);
    return { id, name, before: index === -1 ? words.length : index };
  });
}
