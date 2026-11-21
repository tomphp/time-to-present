import recorded from "../fixtures/recorded-rehearsal.json";
import type { SessionState, StreamEvent } from "./session";

/** A rehearsal recorded through the core Session: its state, and every event with the wall time it went out. */
export const rehearsal = recorded as unknown as {
  state: SessionState;
  stream: Array<{ at: number; event: StreamEvent }>;
};

export const eventsUpTo = (at: number) => rehearsal.stream.filter((entry) => entry.at <= at);
