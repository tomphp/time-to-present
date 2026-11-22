import type { Display, PerformanceLayout, PerformanceSettings } from "./session";

/** Lets the core choose: the main display for the Teleprompter, another one for the Presentation. */
export const AUTOMATIC = "";

const LAYOUTS: readonly PerformanceLayout[] = ["twoWindows", "combined", "teleprompterOnly"];

export interface Choice {
  value: string;
  label: string;
}

export type MenuValues = Record<keyof PerformanceSettings, string>;

export function displayChoices(displays: Display[], remembered: string | null): Choice[] {
  const connected = displays.map(({ name, primary }) => ({ value: name, label: primary ? `${name} (main)` : name }));
  const missing = remembered !== null && !displays.some(({ name }) => name === remembered);
  return [
    { value: AUTOMATIC, label: "Automatic" },
    ...connected,
    ...(missing ? [{ value: remembered, label: `${remembered} (not connected)` }] : []),
  ];
}

export function chosenSettings(menu: MenuValues): PerformanceSettings {
  return {
    layout: oneOf(LAYOUTS, menu.layout),
    teleprompterDisplay: chosenDisplay(menu.teleprompterDisplay),
    presentationDisplay: chosenDisplay(menu.presentationDisplay),
  };
}

export interface LayoutCommands {
  performanceSettings(): Promise<PerformanceSettings>;
  setPerformanceSettings(settings: PerformanceSettings): Promise<void>;
}

/** Changes the Performance Layout alone, keeping the displays this machine remembers. */
export async function chooseLayout(layout: string, commands: LayoutCommands) {
  const chosen = oneOf(LAYOUTS, layout);
  const settings = await commands.performanceSettings();
  await commands.setPerformanceSettings({ ...settings, layout: chosen });
}

const chosenDisplay = (value: string) => (value === AUTOMATIC ? null : value);

function oneOf<T extends string>(known: readonly T[], value: string): T {
  if (!known.includes(value as T)) throw new Error(`Unknown Perform menu choice: ${value}`);
  return value as T;
}
