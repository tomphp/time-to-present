/** The event stream protocol version this Client speaks. */
export const PROTOCOL_VERSION = 1;

/**
 * A hand-written map from Named Event name to the type of its `data`, such as
 * `{ slide: { index: number }; flash: null }`.
 */
export type EventMap = Record<string, unknown>;

/** The names of the Named Events in `Events`: any `string` without a map. */
export type EventName<Events extends EventMap> = Extract<keyof Events, string>;

/** A Named Event fired at a Script Time, typed by its name when `Events` is given. */
export type NamedEvent<Events extends EventMap = EventMap, Name extends EventName<Events> = EventName<Events>> = {
  [N in Name]: { id: string; name: N; data: Events[N]; scriptTime: number };
}[Name];

/** A Word of the Script, at its absolute Script Time `start`. */
export interface Word {
  id: string;
  text: string;
  start: number;
  duration: number;
}

export type ClockState = "ready" | "playing" | "paused" | "ended";

/** The Performance clock. All times are integer ms of Script Time. */
export interface Clock {
  state: ClockState;
  scriptTime: number;
  speed: number;
}

export type ClockCause = "play" | "pause" | "seek" | "speed" | "end" | "reset" | (string & {});

export interface ClockChange extends Clock {
  cause: ClockCause;
}

/** A complete picture of where the Performance is, sent on connect, seek and Script edit. */
export interface Snapshot<Events extends EventMap = EventMap> {
  protocolVersion: number;
  scriptVersion: number;
  clock: Clock;
  currentWord: Word | null;
  passedEvents: NamedEvent<Events>[];
}

/** The read-only Script served at `/_ttp/v1/script`. */
export interface Script<Events extends EventMap = EventMap> {
  words: Word[];
  namedEvents: NamedEvent<Events>[];
}

/** One event of the stream, as a Source delivers it. */
export type StreamEvent =
  | ({ type: "snapshot" } & Snapshot)
  | ({ type: "clock" } & ClockChange)
  | { type: "tick"; scriptTime: number }
  | ({ type: "word" } & Word)
  | ({ type: "namedEvent" } & NamedEvent)
  | { type: "closed"; reason: string };

export const STREAM_EVENT_TYPES: StreamEvent["type"][] = ["snapshot", "clock", "tick", "word", "namedEvent", "closed"];
