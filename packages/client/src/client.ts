import { fold, type Folded, type Reducers } from "./fold";
import { hooks, type Hooks } from "./hooks";
import { followPerformance } from "./performance";
import { PROTOCOL_VERSION, type Clock, type EventMap, type Script, type StreamEvent, type Word } from "./protocol";
import { scriptStore } from "./script";
import { eventStream, type Source } from "./source";
import { readonly, writable, type Store } from "./store";
import { followTime, type Time } from "./time";

export interface ConnectOptions {
  /** The event stream to follow. Defaults to the same origin's `/_ttp/v1/events`. */
  url?: string;
  /** Follow this Source instead of an event stream, such as a Simulator. */
  source?: Source;
}

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export interface Client<Events extends EventMap = EventMap> extends Hooks<Events>, Time {
  /** `open` once a Snapshot arrives; `reconnecting` while the stream is lost or the Presentation is closed. */
  connection: Store<ConnectionState>;
  /** Why the Client closed itself, such as an unsupported protocol version. */
  error: Store<Error | null>;
  /** The clock as it last changed. Use `now()` for the Script Time in between. */
  clock: Store<Clock>;
  /** The Word being spoken, else the last Word started, else null. */
  currentWord: Store<Word | null>;
  /** The whole Script, read-only: null until fetched on first subscribe, refetched after each edit. */
  script: Store<Script<Events> | null>;
  /**
   * Derives app state from the Named Events passed so far: rebuilt from `initial` on every
   * Snapshot with `live: false`, and stepped by each live Named Event with `live: true`.
   * Reducers must be pure.
   */
  fold<State>(initial: State, reducers: Reducers<Events, State>): Store<Folded<State>>;
  /** Disconnects for good. */
  close(): void;
}

const DEFAULT_URL = "/_ttp/v1/events";

/** Follows the Performance, by default from the desktop app serving this page. */
export function connect<Events extends EventMap = EventMap>(options: ConnectOptions = {}): Client<Events> {
  const source = options.source ?? eventStream(options.url ?? DEFAULT_URL);
  const connection = writable<ConnectionState>("connecting");
  const error = writable<Error | null>(null);
  const performance = followPerformance();
  const time = followTime(performance, source);

  const close = () => {
    stop();
    connection.set("closed");
  };

  const receive = (event: StreamEvent) => {
    if (connection.get() === "closed") return;
    if (event.type === "snapshot") {
      if (event.protocolVersion !== PROTOCOL_VERSION) {
        error.set(unsupported(event.protocolVersion));
        return close();
      }
      connection.set("open");
    }
    if (event.type === "closed") connection.set("reconnecting");
    performance.receive(event);
  };

  const stop = source.open({
    event: receive,
    lost: () => {
      if (connection.get() !== "closed") connection.set("reconnecting");
    },
  });

  return {
    connection: readonly(connection),
    error: readonly(error),
    clock: readonly(performance.clock),
    currentWord: readonly(performance.currentWord),
    script: scriptStore<Events>(source, performance.scriptVersion),
    ...hooks<Events>(performance),
    ...time,
    fold: (initial, reducers) => fold(performance, initial, reducers),
    close,
  };
}

const unsupported = (version: number) =>
  new Error(
    `The Performance speaks protocol version ${version}, but this @time-to-present/client speaks version ${PROTOCOL_VERSION}. ` +
      "Install the @time-to-present/client that matches your Time to Present.",
  );
