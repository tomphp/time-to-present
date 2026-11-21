import type { Display } from "./session";

/** Lets the core choose: the main display for the Teleprompter, another one for the Presentation. */
export const AUTOMATIC = "";

export interface Choice {
  value: string;
  label: string;
}

export function displayChoices(displays: Display[], remembered: string | null): Choice[] {
  const connected = displays.map(({ name, primary }) => ({ value: name, label: primary ? `${name} (main)` : name }));
  const missing = remembered !== null && !displays.some(({ name }) => name === remembered);
  return [
    { value: AUTOMATIC, label: "Automatic" },
    ...connected,
    ...(missing ? [{ value: remembered, label: `${remembered} (not connected)` }] : []),
  ];
}
