/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { simulate, type StreamEvent } from "../src";
import { scriptOf, type Presentation } from "./presentation";

type Step =
  | { action: "advance"; ms: number }
  | { action: "connect" | "play" | "pause" | "reset" | "close" }
  | { action: "seek"; scriptTime: number }
  | { action: "speed"; speed: number };

interface Fixture {
  script: Presentation;
  steps: Step[];
  stream: object[];
}

const fixtures = import.meta.glob<Fixture>("../../../protocol-fixtures/*.json", { eager: true, import: "default" });

function run({ script, steps }: Fixture) {
  const simulator = simulate(scriptOf(script), { clock: "manual" });
  const produced: StreamEvent[] = [];
  let joined = false;
  simulator.open({ event: (event) => (joined ? produced.push(event) : (joined = true)), lost: () => {} });

  const connect = () => {
    const stop = simulator.open({ event: (event) => produced.push(event), lost: () => {} });
    stop();
  };

  for (const step of steps) {
    switch (step.action) {
      case "advance":
        simulator.advance(step.ms);
        break;
      case "connect":
        connect();
        break;
      case "seek":
        simulator.seek(step.scriptTime);
        break;
      case "speed":
        simulator.setSpeed(step.speed);
        break;
      case "play":
        simulator.play();
        break;
      case "pause":
        simulator.pause();
        break;
      case "reset":
        simulator.reset();
        break;
      case "close":
        simulator.close();
        break;
    }
  }
  return produced;
}

describe("the Simulator against the shared protocol fixtures", () => {
  it("finds the fixtures", () => {
    expect(Object.keys(fixtures).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(fixtures))("%s produces the exact stream", (_, fixture) => {
    expect(run(fixture)).toEqual(fixture.stream);
  });
});
