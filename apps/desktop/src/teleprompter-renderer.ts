import type { Cue } from "./approach-cue";
import type { ScriptWord, TimedEvent } from "./session";
import { wordLook, type Followed } from "./teleprompter-view";

export type WheelDelta = Pick<WheelEvent, "deltaX" | "deltaY">;

export interface ViewFrame {
  current: number | null;
  over: boolean;
  cue: Cue | null;
  clock: Followed;
  scriptTime: number;
  readingLine: number;
  readMark: number;
}

/** What the Teleprompter window drives each frame, whichever Teleprompter View is showing the Script. */
export interface TeleprompterRenderer {
  render(words: ScriptWord[], events: TimedEvent[], scriptEnd: number): void;
  show(frame: ViewFrame): void;
  /** Scrolling never moves the clock: it only looks ahead or back while the clock stands still. */
  scrollFreelyBy(wheel: WheelDelta, clock: Followed): void;
  invalidateScroll(): void;
  flash(id: string): void;
  destroy(): void;
}

export function endMark() {
  const end = document.createElement("p");
  end.id = "end";
  end.textContent = "END";
  return end;
}

export const lookWords = (spans: HTMLSpanElement[], current: number | null) =>
  spans.forEach((span, index) => (span.className = wordLook(index, current)));

export function marker({ id, name }: { id: string; name: string }) {
  const element = document.createElement("small");
  element.className = "marker";
  element.dataset.event = id;
  element.textContent = name;
  return element;
}

const FLASH = "fired";

export function flashMarker(column: HTMLElement, id: string) {
  const element = column.querySelector<HTMLElement>(`[data-event="${id}"]`);
  if (!element) return;
  element.classList.remove(FLASH);
  element.getBoundingClientRect();
  element.classList.add(FLASH);
}
