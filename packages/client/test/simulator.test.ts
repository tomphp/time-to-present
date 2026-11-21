import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, simulate, type SimulatedScript } from "../src";
import { word } from "./protocol";

type Events = { slide: { index: number }; flash: null };

const script: SimulatedScript<Events> = {
  words: [word("w1", "One", 200), word("w2", "two", 600), word("w3", "three.", 1000)],
  namedEvents: [
    { id: "e1", name: "slide", data: { index: 1 }, scriptTime: 0 },
    { id: "e2", name: "slide", data: { index: 2 }, scriptTime: 600 },
    { id: "e3", name: "flash", data: null, scriptTime: 1500 },
  ],
};

const following = () => {
  const simulator = simulate<Events>(script, { clock: "manual" });
  const client = connect<Events>({ source: simulator });
  const slide = client.fold(0, { slide: (_, event) => event.data.index });
  return { simulator, client, slide };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("simulate", () => {
  it("opens the Client with a Snapshot of a ready clock", () => {
    const { client } = following();

    expect(client.connection.get()).toBe("open");
    expect(client.clock.get()).toEqual({ state: "ready", scriptTime: 0, speed: 1 });
  });

  it("plays the Script as wall time advances, stepping Folds live", () => {
    const { simulator, client, slide } = following();
    const words: string[] = [];
    client.onWord((word) => words.push(word.text));

    simulator.play();
    simulator.advance(700);

    expect(words).toEqual(["One", "two"]);
    expect(client.currentWord.get()?.id).toBe("w2");
    expect(slide.get()).toEqual({ state: 2, live: true });
    expect(client.now()).toBe(700);
  });

  it("rebuilds Folds from a Snapshot on seek, firing no hooks for what it skipped", () => {
    const { simulator, client, slide } = following();
    const heard: string[] = [];
    client.onNamedEvent((event) => heard.push(event.id));

    simulator.seek(900);

    expect(heard).toEqual([]);
    expect(slide.get()).toEqual({ state: 2, live: false });
    expect(client.clock.get()).toEqual({ state: "paused", scriptTime: 900, speed: 1 });
  });

  it("changes speed and resets to ready with the speed kept", () => {
    const { simulator, client, slide } = following();
    simulator.setSpeed(1.5);
    simulator.play();
    simulator.advance(400);

    simulator.reset();

    expect(client.clock.get()).toEqual({ state: "ready", scriptTime: 0, speed: 1.5 });
    expect(client.currentWord.get()).toBeNull();
    expect(slide.get()).toEqual({ state: 0, live: false });
  });

  it("pauses where the clock is", () => {
    const { simulator, client } = following();
    simulator.play();
    simulator.advance(250);

    simulator.pause();
    simulator.advance(1000);

    expect(client.clock.get()).toEqual({ state: "paused", scriptTime: 250, speed: 1 });
  });

  it("runs onFrame once per advance while playing", () => {
    const { simulator, client } = following();
    const frames: number[] = [];
    client.onFrame((scriptTime) => frames.push(scriptTime));

    simulator.play();
    simulator.advance(16);
    simulator.advance(17);
    simulator.pause();
    simulator.advance(100);

    expect(frames).toEqual([0, 0, 16, 33, 33]);
  });

  it("serves the Script in the /_ttp/v1/script shape", async () => {
    const { client } = following();
    client.script.subscribe(() => {});
    await vi.waitFor(() => expect(client.script.get()).not.toBeNull());

    expect(client.script.get()).toEqual({ protocolVersion: 1, scriptVersion: 1, scriptEnd: 1500, ...script });
  });

  it("ends the Script past its last Word when no end is given", async () => {
    const simulator = simulate({ words: [word("w1", "Hi.", 100, 250)], namedEvents: [] }, { clock: "manual" });

    expect((await simulator.script()).scriptEnd).toBe(350);
  });

  it("puts each Client into reconnecting once closed", () => {
    const { simulator, client } = following();

    simulator.close();
    simulator.play();

    expect(client.connection.get()).toBe("reconnecting");
    expect(client.clock.get().state).toBe("ready");
  });

  it("stops sending to a Client once it closes", () => {
    const { simulator, client } = following();

    client.close();
    simulator.play();

    expect(client.clock.get().state).toBe("ready");
  });

  it("runs on the page's own clock unless manual", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    const simulator = simulate<Events>(script);
    const client = connect<Events>({ source: simulator });

    simulator.play();
    vi.advanceTimersByTime(1100);

    expect(client.currentWord.get()?.id).toBe("w3");
    expect(client.now()).toBe(1100);

    vi.advanceTimersByTime(1000);
    expect(client.clock.get()).toEqual({ state: "ended", scriptTime: 1500, speed: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
