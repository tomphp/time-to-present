import { PROTOCOL_VERSION, type Clock, type ClockCause, type Snapshot, type StreamEvent } from "./protocol";
import type { Timeline } from "./timeline";

const TICK_INTERVAL = 100;
/** Before anything has fired, so that Words and Named Events at Script Time 0 cross on play. */
const NOTHING_EMITTED = -1;

type State =
  | { name: "ready" }
  | { name: "playing"; from: number; since: number; emittedUpTo: number }
  | { name: "paused"; at: number }
  | { name: "ended"; at: number };

/** A speed in hundredths, 0.50× to 2.00× in 0.05 steps, so Script Time stays exact. */
const nearestSpeed = (factor: number) => Math.min(200, Math.max(50, Math.round((factor * 100) / 5) * 5));

/**
 * The core's Performance clock over wall time in integer ms. Every command returns what it
 * broadcasts, in Script Time order.
 */
export function simulatedClock(timeline: Timeline) {
  let state: State = { name: "ready" };
  let speed = 100;
  let lastTick = 0;

  const scriptTime = (now: number) => {
    switch (state.name) {
      case "ready":
        return 0;
      case "playing":
        return state.from + Math.floor(((now - state.since) * speed) / 100);
      default:
        return state.at;
    }
  };

  const view = (now: number): Clock => ({ state: state.name, scriptTime: scriptTime(now), speed: speed / 100 });

  const change = (cause: ClockCause, now: number): StreamEvent => ({ type: "clock", ...view(now), cause });

  const snapshot = (now: number): Snapshot => {
    const clock = view(now);
    const started = state.name !== "ready";
    return {
      protocolVersion: PROTOCOL_VERSION,
      scriptVersion: timeline.version,
      clock,
      currentWord: started ? timeline.currentWord(clock.scriptTime) : null,
      passedEvents: started ? timeline.passedEvents(clock.scriptTime) : [],
    };
  };

  /** Runs the clock up to `now`: everything crossed, then a tick once due, or the end once reached. */
  const advance = (now: number): StreamEvent[] => {
    if (state.name !== "playing") return [];
    const reached = scriptTime(now);
    if (reached >= timeline.scriptEnd) {
      const events = timeline.crossed(state.emittedUpTo, timeline.scriptEnd);
      state = { name: "ended", at: timeline.scriptEnd };
      return [...events, change("end", now)];
    }
    const events = timeline.crossed(state.emittedUpTo, reached);
    state = { ...state, emittedUpTo: reached };
    if (now - lastTick >= TICK_INTERVAL) {
      lastTick = now;
      events.push({ type: "tick", scriptTime: reached });
    }
    return events;
  };

  return {
    view,
    snapshot,
    advance,

    play(now: number): StreamEvent[] {
      if (state.name === "playing" || state.name === "ended") return [];
      const from = state.name === "paused" ? state.at : 0;
      const emittedUpTo = state.name === "paused" ? state.at : NOTHING_EMITTED;
      state = { name: "playing", from, since: now, emittedUpTo };
      lastTick = now;
      return [change("play", now), ...advance(now)];
    },

    pause(now: number): StreamEvent[] {
      const events = advance(now);
      if (state.name !== "playing") return events;
      state = { name: "paused", at: scriptTime(now) };
      return [...events, change("pause", now)];
    },

    /** Lands within the Script, keeping the state except that `ready` and `ended` become `paused`. */
    seek(now: number, target: number): StreamEvent[] {
      if (Number.isNaN(target)) return [];
      const events = advance(now);
      const at = Math.min(Math.max(Math.round(target), 0), timeline.scriptEnd);
      state = state.name === "playing" ? { name: "playing", from: at, since: now, emittedUpTo: at } : { name: "paused", at };
      return [...events, { type: "snapshot", ...snapshot(now) }];
    },

    setSpeed(now: number, factor: number): StreamEvent[] {
      const next = nearestSpeed(factor);
      if (Number.isNaN(next) || next === speed) return [];
      const events = advance(now);
      if (state.name === "playing") state = { ...state, from: scriptTime(now), since: now };
      speed = next;
      return [...events, change("speed", now)];
    },

    reset(now: number): StreamEvent[] {
      const events = advance(now);
      if (state.name === "ready") return events;
      state = { name: "ready" };
      return [...events, change("reset", now)];
    },
  };
}
