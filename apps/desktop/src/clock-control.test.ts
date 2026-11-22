// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { mountClockControl } from "./clock-control";
import type { ClockState, StreamEvent } from "./session";

const settle = () => new Promise((resolve) => setTimeout(resolve));

let calls: string[];
let send: (event: StreamEvent) => void;

beforeEach(() => {
  document.body.innerHTML = `
    <p id="error" hidden></p>
    <button id="play-pause"></button>
    <span id="clock-elapsed"></span><span id="clock-state"></span>`;
  calls = [];
});

function mount() {
  return mountClockControl(() => {}, {
    play: async () => void calls.push("play"),
    pause: async () => void calls.push("pause"),
    reset: async () => void calls.push("reset"),
    onStreamEvent: (render) => (send = render),
  });
}

const clockIs = (state: ClockState) => send({ type: "clock", cause: "play", state, scriptTime: 0, speed: 1 });
const button = () => document.querySelector<HTMLButtonElement>("#play-pause")!;

describe("Play/Pause from the menu", () => {
  it("plays from where the clock stands, as the button does", async () => {
    const clock = mount();
    clockIs("ready");
    clock.playPause();
    button().click();
    await settle();

    expect(calls).toEqual(["play", "play"]);
  });

  it("pauses while the clock plays, as the button does", async () => {
    const clock = mount();
    clockIs("playing");
    clock.playPause();
    button().click();
    await settle();

    expect(button().getAttribute("aria-label")).toBe("Pause");
    expect(calls).toEqual(["pause", "pause"]);
  });

  it("does nothing once the Performance has ended", async () => {
    const clock = mount();
    clockIs("ended");
    clock.playPause();
    await settle();

    expect(calls).toEqual([]);
  });
});

describe("Restart from the menu", () => {
  it("restarts an ended Performance, as the button does", async () => {
    const clock = mount();
    clockIs("ended");
    clock.restart();
    button().click();
    await settle();

    expect(button().getAttribute("aria-label")).toBe("Restart");
    expect(calls).toEqual(["reset", "reset"]);
  });

  it("does nothing before the Performance has ended", async () => {
    const clock = mount();
    clockIs("paused");
    clock.restart();
    await settle();

    expect(calls).toEqual([]);
  });
});

describe("the Play/Pause button", () => {
  const tooltip = () => button().dataset.tooltip;

  it("plays from where the clock stands while the clock is not playing", () => {
    mount();
    clockIs("paused");

    expect(button().getAttribute("aria-label")).toBe("Play from where the clock stands");
    expect(tooltip()).toBe("Play from where the clock stands");
  });

  it("pauses while the clock plays", () => {
    mount();
    clockIs("playing");

    expect(tooltip()).toBe("Pause");
  });

  it("shows Restart when the Performance has ended", () => {
    mount();
    clockIs("ended");

    expect(tooltip()).toBe("Restart");
    expect(button().disabled).toBe(false);
  });

  it("is an icon with no text", () => {
    mount();
    clockIs("ready");

    expect(button().querySelector("svg")).not.toBeNull();
    expect(button().textContent).toBe("");
  });

  it("is disabled until the clock is heard", () => {
    mount();

    expect(button().disabled).toBe(true);
    expect(tooltip()).toBe("Play from where the clock stands");
  });
});

describe("the clock readout", () => {
  it("shows the Script Time and Clock State, and not the Current Word", () => {
    mount();
    send({ type: "clock", cause: "play", state: "playing", scriptTime: 65_000, speed: 1 });
    send({ type: "word", id: "w1", text: "Hello", start: 65_000, duration: 300 } as StreamEvent);

    expect(document.querySelector("#clock-elapsed")!.textContent).toBe("1:05");
    expect(document.querySelector("#clock-state")!.textContent).toBe("playing");
    expect(document.body.textContent).not.toContain("Hello");
  });
});
