import { formatElapsed } from "./recording-bar-view";
import type { ClockState, ServerStatus, StreamEvent, TimedEvent } from "./session";

const STATE_ICONS: Record<ClockState, string> = { ready: "◼", playing: "▶", paused: "❚❚", ended: "✔" };

export const clockIcon = (state: ClockState | null) => (state ? STATE_ICONS[state] : "");

/** Time left at the current speed: `(Script End − scriptTime) ÷ speed`, shown as `−m:ss`. */
export function remaining(scriptTime: number, scriptEnd: number, speed: number) {
  return `−${formatElapsed(Math.max(0, scriptEnd - scriptTime) / speed)}`;
}

const fraction = (time: number, scriptEnd: number) => (scriptEnd <= 0 ? 0 : Math.min(1, Math.max(0, time / scriptEnd)));

export const progress = (scriptTime: number, scriptEnd: number) => fraction(scriptTime, scriptEnd);

/** Where each Named Event sits along the progress track, 0 to 1. */
export const eventTicks = (events: Pick<TimedEvent, "time">[], scriptEnd: number) =>
  events.map((event) => fraction(event.time, scriptEnd));

export const speedLabel = (speed: number) => `${speed.toFixed(2).replace(/0$/, "")}×`;

export const speedChanged = (speed: number) => speed !== 1;

/** Whether the first press of play should only warn: nothing has connected to the Presentation App's stream. */
export function playNeedsConfirmation(state: ClockState | null, connectedApps: number, warned: boolean) {
  return state === "ready" && connectedApps === 0 && !warned;
}

export const NO_APP_WARNING = "No Presentation App connected. Press play again to start anyway.";
export const FOCUS_WARNING = "Teleprompter lost focus: keys won't reach it from an external browser.";

export const focusLost = (state: ClockState | null, focused: boolean) => state === "playing" && !focused;

/** Wall-clock time of the Performance so far, pauses included, from the first play to its end. */
export interface Run {
  startedAt: number | null;
  endedAt: number | null;
}

export const NOT_STARTED: Run = { startedAt: null, endedAt: null };

export function foldRun(run: Run, event: StreamEvent, at: number): Run {
  switch (event.type) {
    case "snapshot":
      return event.clock.state === "ready" ? NOT_STARTED : { startedAt: run.startedAt ?? at, endedAt: null };
    case "clock":
      if (event.cause === "reset") return NOT_STARTED;
      if (event.cause === "end") return { startedAt: run.startedAt ?? at, endedAt: at };
      return { startedAt: run.startedAt ?? at, endedAt: null };
    case "closed":
      return NOT_STARTED;
    default:
      return run;
  }
}

export function endedSummary(run: Run, scriptEnd: number) {
  const total = run.startedAt === null || run.endedAt === null ? 0 : run.endedAt - run.startedAt;
  return `Ended · ${formatElapsed(total)} (Script ${formatElapsed(scriptEnd)})`;
}

export const connectionSummary = ({ url, connectedApps }: Pick<ServerStatus, "url" | "connectedApps">) => ({
  url,
  apps: connectedApps === 1 ? "1 app connected" : `${connectedApps} apps connected`,
});
