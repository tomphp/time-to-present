import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect } from "../src";
import { fakeBrowser } from "./fake-browser";
import { snapshot } from "./protocol";

let browser: ReturnType<typeof fakeBrowser>;

beforeEach(() => {
  browser = fakeBrowser();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("connect", () => {
  it("follows the same origin's event stream by default", () => {
    connect();

    expect(browser.stream.url).toBe("http://localhost:4747/_ttp/v1/events");
  });

  it("follows the stream at options.url", () => {
    connect({ url: "http://localhost:5000/_ttp/v1/events" });

    expect(browser.stream.url).toBe("http://localhost:5000/_ttp/v1/events");
  });

  it("is connecting until the first Snapshot, then open", () => {
    const client = connect();
    expect(client.connection.get()).toBe("connecting");

    browser.stream.send("snapshot", snapshot());

    expect(client.connection.get()).toBe("open");
  });

  it("disconnects on close()", () => {
    const client = connect();
    browser.stream.send("snapshot", snapshot());

    client.close();

    expect(client.connection.get()).toBe("closed");
    expect(browser.stream.closed).toBe(true);
  });

  it("closes with an error naming both versions on an unsupported protocol version", () => {
    const client = connect();

    browser.stream.send("snapshot", snapshot({ protocolVersion: 2, clock: { state: "paused", scriptTime: 500, speed: 1 } }));

    expect(client.connection.get()).toBe("closed");
    expect(browser.stream.closed).toBe(true);
    expect(client.error.get()?.message).toMatch(/protocol version 2.*speaks version 1/);
  });

  it("is reconnecting once the Presentation is closed, and open on the next Snapshot", () => {
    const client = connect();
    browser.stream.send("snapshot", snapshot());

    browser.stream.send("closed", { reason: "closed" });
    expect(client.connection.get()).toBe("reconnecting");

    browser.stream.send("snapshot", snapshot());
    expect(client.connection.get()).toBe("open");
  });

  it("is reconnecting while the browser retries a dropped stream", () => {
    const client = connect();
    browser.stream.send("snapshot", snapshot());

    browser.stream.drop(true);

    expect(client.connection.get()).toBe("reconnecting");
    expect(browser.streams).toHaveLength(1);
  });

  it("reopens a stream the browser gave up on a second later", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const client = connect();
    browser.stream.drop(false);

    vi.advanceTimersByTime(999);
    expect(browser.streams).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(browser.streams).toHaveLength(2);

    browser.stream.send("snapshot", snapshot());
    expect(client.connection.get()).toBe("open");
  });

  it("stays closed after close(), whatever the stream does", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const client = connect();
    const stream = browser.stream;
    stream.drop(false);

    client.close();
    vi.advanceTimersByTime(1000);
    stream.send("snapshot", snapshot());

    expect(browser.streams).toHaveLength(1);
    expect(client.connection.get()).toBe("closed");
  });
});
