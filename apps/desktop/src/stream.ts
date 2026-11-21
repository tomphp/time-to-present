import type { Snapshot, StreamEvent } from "./session";

export interface StreamSource {
  listen(onEvent: (event: StreamEvent) => void): Promise<unknown>;
  snapshot(): Promise<Snapshot>;
}

/**
 * Every Session event from now on, after the Snapshot a connecting client starts with. The
 * listener is in place before the Snapshot is asked for, and events that arrive while it is on
 * its way wait behind it. A `closed` means the Presentation changed, so the next one's Snapshot
 * follows if there is one.
 */
export async function connectStream(source: StreamSource, render: (event: StreamEvent) => void) {
  let waiting: StreamEvent[] | null = null;

  const receive = (event: StreamEvent) => {
    if (waiting) return void waiting.push(event);
    render(event);
    if (event.type === "closed") void connect();
  };

  async function connect() {
    waiting = [];
    await source.snapshot().then(
      (snapshot) => render({ type: "snapshot", ...snapshot }),
      () => undefined,
    );
    const held = waiting;
    waiting = null;
    held.forEach(receive);
  }

  await source.listen(receive);
  await connect();
}
