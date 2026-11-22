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
    <span id="clock-state"></span><span id="clock-elapsed"></span><span id="current-word"></span>`;
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

    expect(button().textContent).toBe("Pause");
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

    expect(button().textContent).toBe("Restart");
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
