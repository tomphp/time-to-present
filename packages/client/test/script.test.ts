import { beforeEach, describe, expect, it } from "vitest";
import { connect } from "../src";
import { fakeBrowser } from "./fake-browser";
import { namedEvent, snapshot, word } from "./protocol";

let browser: ReturnType<typeof fakeBrowser>;

beforeEach(() => {
  browser = fakeBrowser();
});

const settle = () => new Promise((resolve) => setTimeout(resolve));

const SCRIPT_URL = "http://localhost:4747/_ttp/v1/script";
const firstScript = { words: [word("w1", "One", 200)], namedEvents: [namedEvent("e1", "slide", { index: 1 }, 0)] };
const editedScript = { words: [word("w1", "Won", 200)], namedEvents: [] };

describe("script", () => {
  it("fetches nothing until first subscribed", async () => {
    const client = connect();
    browser.serveScript(firstScript);
    browser.stream.send("snapshot", snapshot());
    await settle();

    expect(browser.fetched).toEqual([]);
    expect(client.script.get()).toBeNull();
  });

  it("fetches the Script beside the event stream on first subscribe", async () => {
    const client = connect();
    browser.serveScript(firstScript);
    browser.stream.send("snapshot", snapshot());

    client.script.subscribe(() => {});

    await settle();
    expect(client.script.get()).toEqual(firstScript);
    expect(browser.fetched).toEqual([SCRIPT_URL]);
  });

  it("waits for the first Snapshot to know which Script to fetch", async () => {
    const client = connect();
    browser.serveScript(firstScript);
    client.script.subscribe(() => {});
    expect(browser.fetched).toEqual([]);

    browser.stream.send("snapshot", snapshot());

    await settle();
    expect(client.script.get()).toEqual(firstScript);
  });

  it("refetches when the scriptVersion changes, and only then", async () => {
    const client = connect();
    browser.serveScript(firstScript);
    browser.stream.send("snapshot", snapshot());
    client.script.subscribe(() => {});
    await settle();
    expect(client.script.get()).toEqual(firstScript);

    browser.serveScript(editedScript);
    browser.stream.send("snapshot", snapshot());
    browser.stream.send("snapshot", snapshot({ scriptVersion: 2 }));

    await settle();
    expect(client.script.get()).toEqual(editedScript);
    expect(browser.fetched).toHaveLength(2);
  });

  it("fetches from beside options.url", () => {
    const client = connect({ url: "http://localhost:5000/_ttp/v1/events" });
    browser.stream.send("snapshot", snapshot());

    client.script.subscribe(() => {});

    expect(browser.fetched).toEqual(["http://localhost:5000/_ttp/v1/script"]);
  });

  it("keeps the Script of the latest version when fetches finish out of order", async () => {
    const client = connect();
    browser.holdScripts();
    browser.stream.send("snapshot", snapshot());
    client.script.subscribe(() => {});
    browser.stream.send("snapshot", snapshot({ scriptVersion: 2 }));

    browser.respond(1, editedScript);
    await settle();
    browser.respond(0, firstScript);
    await settle();

    expect(client.script.get()).toEqual(editedScript);
  });
});
