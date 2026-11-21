import { connect, simulate } from "@time-to-present/client";
import type { Events } from "./events";
import { simulatedScript } from "./simulated-script";
import { mount } from "./slides";

const root = document.getElementById("slides");
if (!root) throw new Error("index.html needs an element with id=\"slides\"");

function simulator() {
  const simulated = simulate<Events>(simulatedScript);
  simulated.keyboard();
  return simulated;
}

mount(root, connect<Events>({ source: import.meta.env.MODE === "sim" ? simulator() : undefined }));
