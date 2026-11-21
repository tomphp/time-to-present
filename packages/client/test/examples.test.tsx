// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { connect, simulate } from "../src";
import { Slides } from "../examples/react-slides";
import { script, type Events } from "../examples/script";
import { mountSlides } from "../examples/vanilla-slides";
import { mountCaptions } from "../examples/word-captions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const slides = ["Intro", "Agenda"];
const performance = () => {
  const simulator = simulate<Events>(script, { clock: "manual" });
  return { simulator, client: connect<Events>({ source: simulator }) };
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("examples", () => {
  it("vanilla slides follow the Performance and stay right after a seek", () => {
    const { simulator, client } = performance();
    const root = document.body.appendChild(document.createElement("div"));
    mountSlides(client, root, slides);
    expect(root.textContent).toBe("Intro");

    simulator.play();
    simulator.advance(1000);
    expect(root.textContent).toBe("Agenda");
    simulator.seek(100);
    expect(root.textContent).toBe("Intro");
  });

  it("React slides follow the Performance through useSyncExternalStore", async () => {
    const { simulator, client } = performance();
    const root = document.body.appendChild(document.createElement("div"));
    await act(async () => createRoot(root).render(createElement(Slides, { client, slides })));
    expect(root.textContent).toBe("Intro");

    await act(async () => {
      simulator.seek(1000);
    });
    expect(root.textContent).toBe("Agenda");
  });

  it("word captions mark the Word being spoken", async () => {
    const { simulator, client } = performance();
    const root = document.body.appendChild(document.createElement("div"));
    mountCaptions(client, root);
    await Promise.resolve();
    expect(root.textContent?.trim()).toBe("Welcome to the talk.");

    simulator.play();
    simulator.advance(650);
    expect(root.querySelector(".current")?.textContent?.trim()).toBe("to");
  });
});
