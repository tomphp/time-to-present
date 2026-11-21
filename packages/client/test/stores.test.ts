import { beforeEach, describe, expect, it } from "vitest";
import { connect, type Store } from "../src";
import { fakeBrowser } from "./fake-browser";
import { clock, namedEvent, snapshot, word } from "./protocol";

let browser: ReturnType<typeof fakeBrowser>;

beforeEach(() => {
  browser = fakeBrowser();
});

const settle = () => new Promise((resolve) => setTimeout(resolve));

/** What `useSyncExternalStore(store.subscribe, store.get)` relies on. */
async function holdsTheExternalStoreContract<T>(store: Store<T>, change: () => void) {
  const { subscribe, get } = store;
  let notified = 0;
  const unsubscribe = subscribe(() => notified++);
  const before = get();
  expect(get()).toBe(before);
  notified = 0;

  change();
  await settle();

  expect(notified).toBeGreaterThan(0);
  expect(get()).not.toBe(before);
  expect(get()).toBe(get());
  unsubscribe();
  notified = 0;
  browser.stream.send("snapshot", snapshot({ scriptVersion: 9, clock: { state: "paused", scriptTime: 1, speed: 1 } }));
  await settle();
  expect(notified).toBe(0);
}

describe("every store", () => {
  it("calls a subscriber at once with the current value", () => {
    const client = connect();
    const values: unknown[] = [];

    client.connection.subscribe((value) => values.push(value));

    expect(values).toEqual(["connecting"]);
  });

  it("holds the external store contract", async () => {
    const client = connect();
    browser.serveScript({ words: [], namedEvents: [] });
    const send = (type: string, payload: object) => () => browser.stream.send(type, payload);

    await holdsTheExternalStoreContract(client.connection, send("snapshot", snapshot()));
    await holdsTheExternalStoreContract(client.clock, send("clock", clock("playing", 1, "play")));
    await holdsTheExternalStoreContract(client.currentWord, send("word", word("w1", "One", 200)));
    await holdsTheExternalStoreContract(client.script, send("snapshot", snapshot({ scriptVersion: 2 })));
    await holdsTheExternalStoreContract(
      client.fold(0, { slide: (count) => count + 1 }),
      send("namedEvent", namedEvent("e1", "slide", null, 0)),
    );
    await holdsTheExternalStoreContract(client.error, send("snapshot", snapshot({ protocolVersion: 2 })));
  });
});
