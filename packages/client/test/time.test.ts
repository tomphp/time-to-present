import { beforeEach, describe, expect, it } from "vitest";
import { connect } from "../src";
import { fakeBrowser } from "./fake-browser";
import { clock, snapshot } from "./protocol";

let browser: ReturnType<typeof fakeBrowser>;

beforeEach(() => {
  browser = fakeBrowser();
});

const playingFrom = (scriptTime: number, speed = 1) =>
  snapshot({ clock: { state: "playing", scriptTime, speed } });

describe("now", () => {
  it("is 0 before any Snapshot, however much time passes", () => {
    const client = connect();
    browser.advance(500);

    expect(client.now()).toBe(0);
  });

  it("extrapolates scriptTime + elapsed × speed while playing, in whole ms", () => {
    const client = connect();
    browser.stream.send("snapshot", playingFrom(1000, 1.5));

    browser.advance(101);

    expect(client.now()).toBe(1152);
  });

  it("extrapolates from the latest Tick", () => {
    const client = connect();
    browser.stream.send("clock", clock("playing", 0, "play"));
    browser.advance(120);
    browser.stream.send("tick", { scriptTime: 100 });

    browser.advance(30);

    expect(client.now()).toBe(130);
  });

  it("never steps back on a Tick that arrives late", () => {
    const client = connect();
    browser.stream.send("snapshot", playingFrom(0));
    browser.advance(130);
    expect(client.now()).toBe(130);

    browser.stream.send("tick", { scriptTime: 100 });
    expect(client.now()).toBe(130);

    browser.advance(40);
    expect(client.now()).toBe(140);
  });

  it("is frozen while not playing", () => {
    const client = connect();
    browser.stream.send("snapshot", playingFrom(1000));
    browser.advance(200);
    browser.stream.send("clock", clock("paused", 1200, "pause"));

    browser.advance(5000);

    expect(client.now()).toBe(1200);
  });
});

describe("onFrame", () => {
  it("runs at once with the Script Time", () => {
    const client = connect();
    browser.stream.send("snapshot", snapshot({ clock: { state: "paused", scriptTime: 400, speed: 1 } }));
    const frames: number[] = [];

    client.onFrame((scriptTime) => frames.push(scriptTime));

    expect(frames).toEqual([400]);
  });

  it("runs on every animation frame while playing", () => {
    const client = connect();
    const frames: number[] = [];
    client.onFrame((scriptTime) => frames.push(scriptTime));
    browser.stream.send("snapshot", playingFrom(0));

    browser.advance(16);
    browser.runFrame();
    browser.advance(17);
    browser.runFrame();

    expect(frames).toEqual([0, 0, 16, 33]);
  });

  it("runs once on a clock change and no more frames while not playing", () => {
    const client = connect();
    const frames: number[] = [];
    browser.stream.send("snapshot", playingFrom(0));
    client.onFrame((scriptTime) => frames.push(scriptTime));

    browser.advance(50);
    browser.stream.send("clock", clock("paused", 50, "pause"));
    browser.stream.send("snapshot", snapshot({ clock: { state: "paused", scriptTime: 900, speed: 1 } }));

    expect(frames).toEqual([0, 50, 900]);
    expect(browser.pendingFrames).toBe(0);
  });

  it("asks for no frames once every frame handler is gone", () => {
    const client = connect();
    browser.stream.send("snapshot", playingFrom(0));
    const stop = client.onFrame(() => {});
    expect(browser.pendingFrames).toBe(1);

    stop();

    expect(browser.pendingFrames).toBe(0);
  });

  it("freezes and stops frames once the Client is closed", () => {
    const client = connect();
    const frames: number[] = [];
    browser.stream.send("snapshot", playingFrom(0));
    client.onFrame((scriptTime) => frames.push(scriptTime));
    browser.advance(100);

    client.close();
    browser.advance(500);

    expect(client.now()).toBe(100);
    expect(frames).toEqual([0, 100]);
    expect(browser.pendingFrames).toBe(0);
  });

  it("freezes once the Presentation is closed", () => {
    const client = connect();
    browser.stream.send("snapshot", playingFrom(0));
    browser.advance(100);

    browser.stream.send("closed", { reason: "closed" });
    browser.advance(500);

    expect(client.now()).toBe(100);
    expect(client.clock.get().state).toBe("paused");
  });
});
