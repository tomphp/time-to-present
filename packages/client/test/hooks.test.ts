import { beforeEach, describe, expect, it } from "vitest";
import { connect } from "../src";
import { fakeBrowser } from "./fake-browser";
import { clock, namedEvent, snapshot, word } from "./protocol";

type Events = { slide: { index: number }; flash: null };

let browser: ReturnType<typeof fakeBrowser>;

beforeEach(() => {
  browser = fakeBrowser();
});

const midway = snapshot({
  clock: { state: "playing", scriptTime: 700, speed: 1 },
  currentWord: word("w2", "two", 600),
  passedEvents: [namedEvent("e1", "slide", { index: 1 }, 0), namedEvent("e2", "slide", { index: 2 }, 600)],
});

describe("raw hooks", () => {
  it("hear only live events, never the past a Snapshot carries", () => {
    const client = connect<Events>();
    const heard: unknown[] = [];
    client.onWord((w) => heard.push(["word", w.id]));
    client.onNamedEvent((e) => heard.push(["namedEvent", e.id]));
    client.onClock((c) => heard.push(["clock", c.cause]));
    client.onTick((scriptTime) => heard.push(["tick", scriptTime]));
    client.onSnapshot((s) => heard.push(["snapshot", s.clock.scriptTime]));

    browser.stream.send("snapshot", midway);
    browser.stream.send("tick", { scriptTime: 800 });
    browser.stream.send("word", word("w3", "three.", 1000));
    browser.stream.send("namedEvent", namedEvent("e3", "flash", null, 1500));
    browser.stream.send("clock", clock("ended", 1500, "end"));

    expect(heard).toEqual([
      ["snapshot", 700],
      ["tick", 800],
      ["word", "w3"],
      ["namedEvent", "e3"],
      ["clock", "end"],
    ]);
  });

  it("hear one Named Event by name", () => {
    const client = connect<Events>();
    const slides: number[] = [];
    client.onNamedEvent("slide", (event) => slides.push(event.data.index));

    browser.stream.send("namedEvent", namedEvent("e1", "slide", { index: 1 }, 0));
    browser.stream.send("namedEvent", namedEvent("e3", "flash", null, 300));
    browser.stream.send("namedEvent", namedEvent("e2", "slide", { index: 2 }, 600));

    expect(slides).toEqual([1, 2]);
  });

  it("stop hearing once unsubscribed", () => {
    const client = connect();
    const ticks: number[] = [];
    const stop = client.onTick((scriptTime) => ticks.push(scriptTime));

    browser.stream.send("tick", { scriptTime: 100 });
    stop();
    browser.stream.send("tick", { scriptTime: 200 });

    expect(ticks).toEqual([100]);
  });
});

describe("clock and currentWord", () => {
  it("are ready with no Word before any Snapshot", () => {
    const client = connect();

    expect(client.clock.get()).toEqual({ state: "ready", scriptTime: 0, speed: 1 });
    expect(client.currentWord.get()).toBeNull();
  });

  it("follow Snapshots, clock changes and live Words", () => {
    const client = connect();
    browser.stream.send("snapshot", midway);
    expect(client.clock.get()).toEqual({ state: "playing", scriptTime: 700, speed: 1 });
    expect(client.currentWord.get()).toEqual(word("w2", "two", 600));

    browser.stream.send("word", word("w3", "three.", 1000));
    browser.stream.send("clock", clock("paused", 1100, "pause"));

    expect(client.currentWord.get()).toEqual(word("w3", "three.", 1000));
    expect(client.clock.get()).toEqual({ state: "paused", scriptTime: 1100, speed: 1 });
  });

  it("lose the current Word on reset", () => {
    const client = connect();
    browser.stream.send("snapshot", midway);

    browser.stream.send("clock", clock("ready", 0, "reset"));

    expect(client.currentWord.get()).toBeNull();
    expect(client.clock.get()).toEqual({ state: "ready", scriptTime: 0, speed: 1 });
  });
});
