import type { Client } from "@time-to-present/client";
import type { Events } from "./script";

export function mountSlides(client: Client<Events>, root: HTMLElement, slides: string[]) {
  const deck = client.fold(0, { slide: (_, event) => event.data.index });
  return deck.subscribe(({ state, live }) => {
    root.textContent = slides[state] ?? "";
    root.dataset.animate = String(live);
  });
}
