import type { SimulatedScript } from "@time-to-present/client";
import type { Events } from "./events";

const words = ["Hello", "and", "welcome.", "Events", "move", "the", "slides.", "Thank", "you."].map((text, i) => ({
  id: `w${i}`,
  text,
  start: i * 500,
  duration: 400,
}));

export const simulatedScript: SimulatedScript<Events> = {
  words,
  namedEvents: [
    { id: "e0", name: "slide", data: { index: 0 }, scriptTime: 0 },
    { id: "e1", name: "slide", data: { index: 1 }, scriptTime: 1500 },
    { id: "e2", name: "slide", data: { index: 2 }, scriptTime: 3500 },
  ],
};
