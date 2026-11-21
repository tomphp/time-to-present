import type { Client } from "@time-to-present/client";
import type { Events } from "./script";

export function mountCaptions(client: Client<Events>, root: HTMLElement) {
  const render = () => {
    const words = client.script.get()?.words ?? [];
    const current = client.currentWord.get();
    root.replaceChildren(
      ...words.map((word) => {
        const span = document.createElement("span");
        span.textContent = `${word.text} `;
        span.classList.toggle("current", word.id === current?.id);
        return span;
      }),
    );
  };
  const stops = [client.script.subscribe(render), client.currentWord.subscribe(render)];
  return () => stops.forEach((stop) => stop());
}
