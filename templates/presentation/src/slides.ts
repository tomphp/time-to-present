import type { Client } from "@time-to-present/client";
import type { Events } from "./events";

export const slides = [
  { title: "Hello", body: "Welcome to your Presentation." },
  { title: "Events", body: "Named Events in your Script change the slide." },
  { title: "Thank you", body: "Edit src/slides.ts to make it yours." },
];

const lastSlide = slides.length - 1;

export const currentSlide = (client: Client<Events>) =>
  client.fold(0, {
    slide: (_, event) => Math.min(Math.max(event.data.index, 0), lastSlide),
  });

export function showSlide(root: HTMLElement, index: number, { animate }: { animate: boolean }) {
  const { title, body } = slides[index];
  root.dataset.slide = String(index);
  root.dataset.animate = String(animate);
  root.innerHTML = `<h1>${title}</h1><p>${body}</p>`;
}
