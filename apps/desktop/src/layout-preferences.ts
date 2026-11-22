/** How the Editor's cards are laid out on this machine: UI preferences, never Presentation data. */
export interface LayoutPreferences {
  inspectorShown: boolean;
  timelineShown: boolean;
  timelineHeight: number;
}

const STORAGE_KEY = "editor-layout";

export const TIMELINE_HEIGHTS = { min: 96, max: 480 };

export const DEFAULT_LAYOUT: LayoutPreferences = { inspectorShown: true, timelineShown: true, timelineHeight: 140 };

const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

const timelineHeight = (value: unknown) =>
  typeof value === "number" && value >= TIMELINE_HEIGHTS.min && value <= TIMELINE_HEIGHTS.max
    ? value
    : DEFAULT_LAYOUT.timelineHeight;

export function loadLayout(storage: Pick<Storage, "getItem">): LayoutPreferences {
  try {
    const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") ?? {};
    return {
      inspectorShown: flag(stored.inspectorShown, DEFAULT_LAYOUT.inspectorShown),
      timelineShown: flag(stored.timelineShown, DEFAULT_LAYOUT.timelineShown),
      timelineHeight: timelineHeight(stored.timelineHeight),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export const saveLayout = (storage: Pick<Storage, "setItem">, layout: LayoutPreferences) =>
  storage.setItem(STORAGE_KEY, JSON.stringify(layout));
