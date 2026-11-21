export type Side = "left" | "right";

export interface Combined {
  side: Side;
  share: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  left: number;
  top: number;
}

const SHARES = { min: 0.2, max: 0.8 };
const STORAGE_KEY = "combined-layout";

export const DEFAULT_COMBINED: Combined = { side: "left", share: 0.6 };

/** The largest 16:9 rectangle that fits the pane, centred. */
export function letterbox({ width, height }: Size): Rect {
  const fitted = width * 9 > height * 16 ? { width: (height * 16) / 9, height } : { width, height: (width * 9) / 16 };
  return { left: (width - fitted.width) / 2, top: (height - fitted.height) / 2, ...fitted };
}

export function paneWidths(total: number, share: number, divider: number) {
  const usable = total - divider;
  return { app: usable * share, teleprompter: usable * (1 - share) };
}

/** The app's share of the window when the divider is dragged to the pointer. */
export function dividerShare(pointerX: number, total: number, side: Side): number {
  if (total <= 0) return DEFAULT_COMBINED.share;
  const fromApp = side === "left" ? pointerX / total : 1 - pointerX / total;
  return Math.min(SHARES.max, Math.max(SHARES.min, fromApp));
}

export const swapSides = ({ side, share }: Combined): Combined => ({ side: side === "left" ? "right" : "left", share });

export function loadCombined(storage: Pick<Storage, "getItem">): Combined {
  try {
    const { side, share } = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    const usable = typeof share === "number" && share >= SHARES.min && share <= SHARES.max;
    return (side === "left" || side === "right") && usable ? { side, share } : DEFAULT_COMBINED;
  } catch {
    return DEFAULT_COMBINED;
  }
}

export const saveCombined = (storage: Pick<Storage, "setItem">, combined: Combined) =>
  storage.setItem(STORAGE_KEY, JSON.stringify(combined));
