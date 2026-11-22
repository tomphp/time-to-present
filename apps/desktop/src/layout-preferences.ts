/** How the Editor's cards are laid out on this machine: UI preferences, never Presentation data. */
export interface LayoutPreferences {
  inspectorShown: boolean;
}

const STORAGE_KEY = "editor-layout";

export const DEFAULT_LAYOUT: LayoutPreferences = { inspectorShown: true };

export function loadLayout(storage: Pick<Storage, "getItem">): LayoutPreferences {
  try {
    const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") ?? {};
    return {
      inspectorShown: typeof stored.inspectorShown === "boolean" ? stored.inspectorShown : DEFAULT_LAYOUT.inspectorShown,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export const saveLayout = (storage: Pick<Storage, "setItem">, layout: LayoutPreferences) =>
  storage.setItem(STORAGE_KEY, JSON.stringify(layout));
