import { connect, simulate } from "@time-to-present/client";
import { describe, expect, it } from "vitest";
import type { Events } from "./events";
import { simulatedScript } from "./simulated-script";
import { currentSlide, showSlide, slides } from "./slides";

function perform() {
  const simulator = simulate<Events>(simulatedScript, { clock: "manual" });
  const root = document.createElement("main");
  const client = connect<Events>({ source: simulator });
  currentSlide(client).subscribe(({ state, live }) => showSlide(root, state, { animate: live }));
  return { simulator, root };
}

describe("the example slides against the Simulator", () => {
  it("start on the first slide", () => {
    const { root } = perform();

    expect(root.dataset.slide).toBe("0");
    expect(root.querySelector("h1")?.textContent).toBe(slides[0].title);
  });

  it("follow the clock through all three slides, animating only as they change live", () => {
    const { simulator, root } = perform();
    simulator.play();

    simulator.advance(1500);
    expect(root.dataset).toMatchObject({ slide: "1", animate: "true" });

    simulator.advance(2000);
    expect(root.dataset.slide).toBe("2");
  });

  it("land on the right slide after a seek, without animating", () => {
    const { simulator, root } = perform();

    simulator.seek(2000);

    expect(root.dataset).toMatchObject({ slide: "1", animate: "false" });
  });
});
