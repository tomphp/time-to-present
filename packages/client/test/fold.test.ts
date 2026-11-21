import { beforeEach, describe, expect, it } from "vitest";
import { connect } from "../src";
import { fakeBrowser } from "./fake-browser";
import { clock, namedEvent, snapshot } from "./protocol";

type Events = { slide: { index: number }; flash: null };

let browser: ReturnType<typeof fakeBrowser>;

beforeEach(() => {
  browser = fakeBrowser();
});

const slideAndFlashes = () => {
  const client = connect<Events>();
  const deck = client.fold(
    { slide: 0, flashes: 0 },
    {
      slide: (state, event) => ({ ...state, slide: event.data.index }),
      flash: (state) => ({ ...state, flashes: state.flashes + 1 }),
    },
  );
  return { client, deck };
};

const passed = [namedEvent("e1", "slide", { index: 1 }, 0), namedEvent("e2", "flash", null, 300), namedEvent("e3", "slide", { index: 2 }, 600)];

describe("fold", () => {
  it("holds the initial state, not live, before any Snapshot", () => {
    const { deck } = slideAndFlashes();

    expect(deck.get()).toEqual({ state: { slide: 0, flashes: 0 }, live: false });
  });

  it("rebuilds from the initial state over the passed events on every Snapshot, not live", () => {
    const { deck } = slideAndFlashes();
    browser.stream.send("snapshot", snapshot({ passedEvents: passed }));
    expect(deck.get()).toEqual({ state: { slide: 2, flashes: 1 }, live: false });

    browser.stream.send("snapshot", snapshot({ passedEvents: passed.slice(0, 1) }));
    expect(deck.get()).toEqual({ state: { slide: 1, flashes: 0 }, live: false });
  });

  it("steps once per live Named Event, live", () => {
    const { deck } = slideAndFlashes();
    browser.stream.send("snapshot", snapshot({ passedEvents: passed.slice(0, 1) }));
    const seen: unknown[] = [];
    deck.subscribe((value) => seen.push(value));

    browser.stream.send("namedEvent", namedEvent("e2", "flash", null, 300));
    browser.stream.send("namedEvent", namedEvent("e3", "slide", { index: 2 }, 600));

    expect(seen).toEqual([
      { state: { slide: 1, flashes: 0 }, live: false },
      { state: { slide: 1, flashes: 1 }, live: true },
      { state: { slide: 2, flashes: 1 }, live: true },
    ]);
  });

  it("ignores Named Events it has no reducer for", () => {
    const client = connect<Events>();
    const slides = client.fold(0, { slide: (_, event) => event.data.index });
    browser.stream.send("snapshot", snapshot({ passedEvents: passed.slice(0, 1) }));
    const before = slides.get();

    browser.stream.send("namedEvent", namedEvent("e2", "flash", null, 300));
    browser.stream.send("namedEvent", namedEvent("e9", "constructor", null, 400));

    expect(slides.get()).toBe(before);
  });

  it("starts from what has passed when created after the Snapshot", () => {
    const client = connect<Events>();
    browser.stream.send("snapshot", snapshot({ passedEvents: passed.slice(0, 2) }));
    browser.stream.send("namedEvent", namedEvent("e3", "slide", { index: 2 }, 600));

    const slides = client.fold(0, { slide: (_, event) => event.data.index });

    expect(slides.get()).toEqual({ state: 2, live: false });
  });

  it("returns to the initial state on reset, not live", () => {
    const { deck } = slideAndFlashes();
    browser.stream.send("snapshot", snapshot({ passedEvents: passed }));

    browser.stream.send("clock", clock("ready", 0, "reset"));

    expect(deck.get()).toEqual({ state: { slide: 0, flashes: 0 }, live: false });
  });
});
