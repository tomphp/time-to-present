import { connect, simulate } from "@time-to-present/client";
import type { Events } from "./events";
import { simulatedScript } from "./simulated-script";
import { currentSlide, showSlide } from "./slides";

const root = document.getElementById("slides")!;

let source;
if (import.meta.env.MODE === "sim") {
  source = simulate<Events>(simulatedScript);
  source.keyboard();
}

const client = connect<Events>({ source });
currentSlide(client).subscribe(({ state, live }) => showSlide(root, state, { animate: live }));
