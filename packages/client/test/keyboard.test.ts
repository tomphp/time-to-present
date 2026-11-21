import { describe, expect, it } from "vitest";
import { connect, simulate, type ScriptWord, type SimulatedScript } from "../src";

const spoken = (id: string, text: string, start: number, breakAfter?: ScriptWord["breakAfter"]): ScriptWord => ({
  id,
  text,
  start,
  duration: 300,
  ...(breakAfter && { breakAfter }),
});

const script: SimulatedScript = {
  words: [
    spoken("w1", "Hello", 0),
    spoken("w2", "there.", 400),
    spoken("w3", "How", 800),
    spoken("w4", "are", 1200),
    spoken("w5", "you?", 1600, "paragraph"),
    spoken("w6", "Fine", 2000),
    spoken("w7", "thanks", 2400, "line"),
    spoken("w8", "all", 2800),
    spoken("w9", "good", 3200),
    spoken("w10", "here.", 3600),
  ],
  namedEvents: [
    { id: "e1", name: "slide", data: 1, scriptTime: 0 },
    { id: "e2", name: "slide", data: 2, scriptTime: 1000 },
    { id: "e3", name: "flash", data: null, scriptTime: 2500 },
  ],
};

interface Modifiers {
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

const keyEvent = (key: string, modifiers: Modifiers = {}) =>
  Object.assign(new Event("keydown", { cancelable: true }), { key, ...modifiers });

const performing = () => {
  const simulator = simulate(script, { clock: "manual" });
  const client = connect({ source: simulator });
  const page = new EventTarget();
  const stop = simulator.keyboard(page);
  const press = (key: string, modifiers?: Modifiers) => {
    const event = keyEvent(key, modifiers);
    page.dispatchEvent(event);
    return event;
  };
  const at = (scriptTime: number) => simulator.seek(scriptTime);
  const clock = () => client.clock.get();
  return { simulator, press, at, clock, stop };
};

describe("simulator.keyboard: play and pause", () => {
  it.each([" ", "PageDown", "ArrowRight"])("%s plays, then pauses", (key) => {
    const { simulator, press, clock } = performing();

    press(key);
    simulator.advance(100);
    expect(clock().state).toBe("playing");

    press(key);
    expect(clock()).toMatchObject({ state: "paused", scriptTime: 100 });
  });

  it("does nothing once ended", () => {
    const { simulator, press, clock } = performing();
    press(" ");
    simulator.advance(4000);

    press(" ");

    expect(clock().state).toBe("ended");
  });

  it("takes the key from the page", () => {
    const { press } = performing();

    expect(press(" ").defaultPrevented).toBe(true);
    expect(press("x").defaultPrevented).toBe(false);
  });
});

describe("simulator.keyboard: seeks", () => {
  it.each(["PageUp", "ArrowLeft"])("%s goes to the start of the current Sentence", (key) => {
    const { at, press, clock } = performing();
    at(1900);

    press(key);

    expect(clock().scriptTime).toBe(800);
  });

  it("goes to the previous Sentence within 1 s of the current one's start", () => {
    const { at, press, clock } = performing();
    at(1700);

    press("PageUp");
    expect(clock().scriptTime).toBe(0);
  });

  it("ends a Sentence at a line break", () => {
    const { at, press, clock } = performing();
    at(3850);

    press("PageUp");
    expect(clock().scriptTime).toBe(2800);
  });

  it("goes by Word with ⌥", () => {
    const { at, press, clock } = performing();
    at(1300);

    press("ArrowLeft", { altKey: true });
    expect(clock().scriptTime).toBe(1200);

    press("ArrowRight", { altKey: true });
    press("ArrowRight", { altKey: true });
    expect(clock().scriptTime).toBe(2000);
  });

  it("goes by Named Event with ⇧", () => {
    const { at, press, clock } = performing();
    at(1300);

    press("ArrowLeft", { shiftKey: true });
    expect(clock().scriptTime).toBe(1000);

    press("ArrowRight", { shiftKey: true });
    expect(clock().scriptTime).toBe(2500);
  });

  it("goes by paragraph with [ and ]", () => {
    const { at, press, clock } = performing();
    at(1300);

    press("]");
    expect(clock().scriptTime).toBe(2000);

    press("]");
    expect(clock().scriptTime).toBe(2000);

    press("[");
    expect(clock().scriptTime).toBe(0);
  });

  it("keeps playing through a seek", () => {
    const { simulator, press, clock } = performing();
    press(" ");
    simulator.advance(500);

    press("ArrowRight", { altKey: true });

    expect(clock()).toMatchObject({ state: "playing", scriptTime: 800 });
  });
});

describe("simulator.keyboard: speed", () => {
  it("steps speed by 0.05 with ↑ and ↓, clamped at the ends", () => {
    const { press, clock } = performing();

    press("ArrowUp");
    expect(clock().speed).toBe(1.05);

    press("ArrowDown");
    press("ArrowDown");
    expect(clock().speed).toBe(0.95);

    for (let i = 0; i < 20; i++) press("ArrowDown");
    expect(clock().speed).toBe(0.5);
  });

  it("returns to 1.0× on 0", () => {
    const { press, clock } = performing();
    press("ArrowUp");

    press("0");

    expect(clock().speed).toBe(1);
  });
});

describe("simulator.keyboard: back to start", () => {
  it("needs Home twice within 2 s", () => {
    const { simulator, press, clock } = performing();
    press(" ");
    simulator.advance(500);

    press("Home");
    expect(clock().state).toBe("playing");

    simulator.advance(2000);
    press("Home");
    expect(clock()).toMatchObject({ state: "ready", scriptTime: 0 });
  });

  it("starts over when the second press comes too late", () => {
    const { simulator, press, clock } = performing();
    press(" ");
    press("Home");
    simulator.advance(2001);

    press("Home");
    expect(clock().state).toBe("playing");
  });
});

describe("simulator.keyboard: what it leaves alone", () => {
  it("ignores keys held with ⌘ or Ctrl", () => {
    const { press, clock } = performing();

    press(" ", { metaKey: true });
    press("ArrowUp", { ctrlKey: true });

    expect(clock()).toMatchObject({ state: "ready", speed: 1 });
  });

  it("ignores keys typed into a field", () => {
    const simulator = simulate(script, { clock: "manual" });
    const client = connect({ source: simulator });
    const field = Object.assign(new EventTarget(), { tagName: "INPUT" });
    simulator.keyboard(field);

    field.dispatchEvent(keyEvent(" "));

    expect(client.clock.get().state).toBe("ready");
  });

  it("stops following keys once unsubscribed", () => {
    const { press, clock, stop } = performing();

    stop();
    press(" ");

    expect(clock().state).toBe("ready");
  });
});
