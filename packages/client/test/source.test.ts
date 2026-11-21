import { describe, expect, it } from "vitest";
import { connect, type Source, type SourceListener } from "../src";
import { snapshot } from "./protocol";

function handMadeSource() {
  let listener: SourceListener | null = null;
  let wall = 1000;
  const source: Source = {
    open(next) {
      listener = next;
      return () => (listener = null);
    },
    script: async () => ({ words: [], namedEvents: [] }),
    now: () => wall,
    frame: () => () => {},
  };
  return {
    source,
    get listener() {
      return listener;
    },
    advance: (ms: number) => (wall += ms),
  };
}

describe("options.source", () => {
  it("follows the Source in place of an event stream, on its time base", () => {
    const fake = handMadeSource();
    const client = connect({ source: fake.source });

    fake.listener!.event({ type: "snapshot", ...snapshot({ clock: { state: "playing", scriptTime: 0, speed: 1 } }) } as never);
    fake.advance(250);

    expect(client.connection.get()).toBe("open");
    expect(client.now()).toBe(250);
  });

  it("is reconnecting when the Source loses the stream, and lets go of it on close()", () => {
    const fake = handMadeSource();
    const client = connect({ source: fake.source });

    fake.listener!.lost();
    expect(client.connection.get()).toBe("reconnecting");

    client.close();
    expect(fake.listener).toBeNull();
  });
});
