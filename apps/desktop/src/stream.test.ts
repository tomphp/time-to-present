import { describe, expect, it, vi } from "vitest";
import type { Snapshot, StreamEvent } from "./session";
import { connectStream } from "./stream";

const snapshotOf = (scriptTime: number): Snapshot => ({
  protocolVersion: 1,
  scriptVersion: 1,
  clock: { state: "playing", scriptTime, speed: 1 },
  currentWord: null,
  passedEvents: [],
});

const tick = (scriptTime: number): StreamEvent => ({ type: "tick", scriptTime });
const settle = () => new Promise((resolve) => setTimeout(resolve));

function source(snapshots: Array<Snapshot | Error>) {
  let receive: (event: StreamEvent) => void = () => {};
  const pending: Array<(snapshot: Snapshot) => void> = [];
  return {
    listen: vi.fn(async (onEvent: (event: StreamEvent) => void) => {
      receive = onEvent;
    }),
    snapshot: vi.fn(() => {
      const next = snapshots.shift()!;
      return next instanceof Error ? Promise.reject(next) : new Promise<Snapshot>((resolve) => pending.push(() => resolve(next)));
    }),
    send: (event: StreamEvent) => receive(event),
    settleSnapshot: async () => {
      await settle();
      pending.shift()?.(snapshotOf(0));
      await settle();
    },
  };
}

describe("connectStream", () => {
  it("listens before it asks for the Snapshot, and holds events back until the Snapshot has rendered", async () => {
    const events = source([snapshotOf(500)]);
    const render = vi.fn();

    const connected = connectStream(events, render);
    await settle();
    events.send(tick(600));
    expect(render).not.toHaveBeenCalled();
    await events.settleSnapshot();
    await connected;
    events.send(tick(700));

    expect(events.listen.mock.invocationCallOrder[0]).toBeLessThan(events.snapshot.mock.invocationCallOrder[0]);
    expect(render.mock.calls.map(([event]) => event)).toEqual([
      { type: "snapshot", ...snapshotOf(500) },
      tick(600),
      tick(700),
    ]);
  });

  it("starts again from a Snapshot after closed", async () => {
    const events = source([snapshotOf(0), snapshotOf(0)]);
    const render = vi.fn();
    const connected = connectStream(events, render);
    await events.settleSnapshot();
    await connected;

    events.send({ type: "closed", reason: "closed" });
    await events.settleSnapshot();

    expect(events.snapshot).toHaveBeenCalledTimes(2);
    expect(render.mock.calls.map(([event]) => event.type)).toEqual(["snapshot", "closed", "snapshot"]);
  });

  it("carries on with live events when no Snapshot comes", async () => {
    const events = source([new Error("no Presentation is open")]);
    const render = vi.fn();

    await connectStream(events, render);
    events.send(tick(100));

    expect(render.mock.calls.map(([event]) => event)).toEqual([tick(100)]);
  });
});
