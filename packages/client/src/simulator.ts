import { deliver } from "./channel.js";
import { PROTOCOL_VERSION, type EventMap, type Script, type StreamEvent } from "./protocol.js";
import type { Source, SourceListener } from "./source.js";
import { followKeys } from "./keyboard.js";
import { seekTargets } from "./seek-targets.js";
import { simulatedClock } from "./simulated-clock.js";
import type { Unsubscribe } from "./store.js";
import { timelineOf, type SimulatedScript } from "./timeline.js";
import { manualWall, realWall } from "./wall.js";

/** How a Simulator's wall time passes. */
export interface SimulateOptions {
  /** `real` follows the page's clock and frames; `manual` stands still until `advance(ms)`. Defaults to `real`. */
  clock?: "real" | "manual";
}

/**
 * The Performance clock run in the page over a Script, for building a Presentation App with no
 * desktop app: pass it to `connect({ source })` and drive it like the Teleprompter.
 */
export interface Simulator<Events extends EventMap = EventMap> extends Source {
  /** Plays from where the clock is; does nothing while playing or ended. */
  play(): void;
  /** Stops the clock where it is. */
  pause(): void;
  /** Jumps to `scriptTime` within the Script and sends a Snapshot; `ready` and `ended` become `paused`. */
  seek(scriptTime: number): void;
  /** Takes `factor` to the nearest 0.05 step from 0.50× to 2.00×. */
  setSpeed(factor: number): void;
  /** Back to start: `ready` at Script Time 0, nothing fired, speed kept. */
  reset(): void;
  /** Closes the Presentation: every Client hears `closed` and the Simulator stops for good. */
  close(): void;
  /** The Script in the `/_ttp/v1/script` shape. */
  script(): Promise<Script<Events>>;
  /**
   * Follows the Teleprompter's Performance keys pressed on `target`, `window` by default:
   * Space, PageDown or → to play and pause; PageUp or ← to the Sentence start; ⌥←/⌥→ by
   * Word; ⇧←/⇧→ by Named Event; `[`/`]` by paragraph; ↑/↓ for speed ±0.05; `0` for 1.0×;
   * and Home twice within 2 s back to start. Keys typed into a field, or held with ⌘ or
   * Ctrl, are left to the page, as are the display keys (B, `.`, E, M, Esc), which have
   * nothing to show here. Returns a function that stops following them.
   */
  keyboard(target?: EventTarget): Unsubscribe;
}

/** A Simulator whose wall time moves only when told to, for deterministic tests. */
export interface ManualSimulator<Events extends EventMap = EventMap> extends Simulator<Events> {
  /** Moves wall time on by `ms`, runs the clock once, then runs any animation frames due. */
  advance(ms: number): void;
}

/** Simulates the Performance over a Script in the `/_ttp/v1/script` shape. */
export function simulate<Events extends EventMap = EventMap>(
  script: SimulatedScript<Events>,
  options: { clock: "manual" },
): ManualSimulator<Events>;
/** Simulates the Performance over a Script, on the page's own clock unless `{ clock: "manual" }`. */
export function simulate<Events extends EventMap = EventMap>(
  script: SimulatedScript<Events>,
  options?: SimulateOptions,
): Simulator<Events>;
export function simulate(script: SimulatedScript, options: SimulateOptions = {}): Simulator | ManualSimulator {
  const timeline = timelineOf(script);
  const clock = simulatedClock(timeline);
  const listeners = new Set<SourceListener>();
  const runClock = () => run(clock.advance);
  const manual = options.clock === "manual" ? manualWall(runClock) : null;
  const wall = manual ?? realWall(runClock);
  let closed = false;

  const send = (listener: SourceListener, event: StreamEvent) => deliver((value) => listener.event(value), event);
  const broadcast = (events: StreamEvent[]) => {
    for (const event of events) for (const listener of [...listeners]) send(listener, event);
  };

  const run = (command: (now: number) => StreamEvent[]) => {
    if (closed) return;
    broadcast(command(wall.now()));
    wall.drive(clock.view(wall.now()).state === "playing");
  };

  const simulator: Simulator = {
    open(listener) {
      if (closed) return () => {};
      run(clock.advance);
      listeners.add(listener);
      send(listener, { type: "snapshot", ...clock.snapshot(wall.now()) });
      return () => listeners.delete(listener);
    },
    script: async () => ({
      protocolVersion: PROTOCOL_VERSION,
      scriptVersion: timeline.version,
      scriptEnd: timeline.scriptEnd,
      words: timeline.words,
      namedEvents: timeline.events,
    }),
    now: wall.now,
    frame: wall.frame,
    play: () => run(clock.play),
    pause: () => run(clock.pause),
    seek: (scriptTime) => run((now) => clock.seek(now, scriptTime)),
    setSpeed: (factor) => run((now) => clock.setSpeed(now, factor)),
    reset: () => run(clock.reset),
    close() {
      if (closed) return;
      broadcast([{ type: "closed", reason: "closed" }]);
      closed = true;
      wall.drive(false);
    },
    keyboard(target = window) {
      const controls = { ...simulator, clock: () => clock.view(wall.now()), now: wall.now };
      return followKeys(target, controls, seekTargets(timeline));
    },
  };
  return manual ? { ...simulator, advance: manual.advance } : simulator;
}
