import type { SimulatedScript } from "@time-to-present/client";

export type Events = { slide: { index: number } };

export const script: SimulatedScript<Events> = {
  words: [
    { id: "w1", text: "Welcome", start: 200, duration: 300 },
    { id: "w2", text: "to", start: 600, duration: 200 },
    { id: "w3", text: "the", start: 900, duration: 200 },
    { id: "w4", text: "talk.", start: 1200, duration: 300, breakAfter: "paragraph" },
  ],
  namedEvents: [
    { id: "e1", name: "slide", data: { index: 0 }, scriptTime: 0 },
    { id: "e2", name: "slide", data: { index: 1 }, scriptTime: 900 },
  ],
};
