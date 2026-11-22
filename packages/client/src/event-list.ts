import type { ResolvedScript } from "./presentation-script.js";
import { nameAndData } from "./script-text.js";

/** A Script Time as `m:ss.mmm`, the minutes unpadded and unbounded. */
function formatScriptTime(scriptTime: number): string {
  const minutes = Math.floor(scriptTime / 60_000);
  const seconds = Math.floor((scriptTime % 60_000) / 1000);
  const ms = scriptTime % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/** One line per Named Event in firing order: Script Time, name, data and anchor Word. */
export function eventLines({ namedEvents, anchorOf }: ResolvedScript): string {
  return namedEvents
    .map((event) => {
      const anchor = anchorOf(event);
      const at = anchor ? `at ${JSON.stringify(anchor.text)}` : "at start";
      return `${formatScriptTime(event.scriptTime)}  ${nameAndData(event, "  ")}  ${at}\n`;
    })
    .join("");
}

/** The Named Events as a JSON array in the protocol's `NamedEvent` shape. */
export function eventJson({ namedEvents }: ResolvedScript): string {
  return `${JSON.stringify(namedEvents.map(({ id, name, data, scriptTime }) => ({ id, name, data, scriptTime })), null, 2)}\n`;
}
