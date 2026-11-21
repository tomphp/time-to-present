import type { Clock } from "./protocol";
import type { Direction, SeekTargets } from "./seek-targets";
import type { Unsubscribe } from "./store";

export interface KeyboardControls {
  clock(): Clock;
  /** Wall time in ms. */
  now(): number;
  play(): void;
  pause(): void;
  seek(scriptTime: number): void;
  setSpeed(factor: number): void;
  reset(): void;
}

const SPEED_STEP = 0.05;
const HOME_AGAIN_WITHIN_MS = 2000;
const TYPING_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

const isTyping = (target: EventTarget | null) => {
  const element = target as Partial<HTMLElement> | null;
  return Boolean(element?.isContentEditable || TYPING_TAGS.includes(element?.tagName ?? ""));
};

/** Drives the clock from the Teleprompter's Performance keys pressed on `target`. */
export function followKeys(
  target: EventTarget,
  controls: KeyboardControls,
  targets: SeekTargets,
): Unsubscribe {
  let homePressedAt: number | null = null;

  const from = () => controls.clock().scriptTime;
  const seekTo = (scriptTime: number | undefined) => {
    if (scriptTime !== undefined) controls.seek(scriptTime);
  };

  const togglePlay = () => (controls.clock().state === "playing" ? controls.pause() : controls.play());
  const sentenceBack = () => seekTo(targets.sentenceBack(from()));
  const changeSpeed = (by: number) => () => controls.setSpeed(controls.clock().speed + by);

  const backToStart = () => {
    const now = controls.now();
    if (homePressedAt !== null && now - homePressedAt <= HOME_AGAIN_WITHIN_MS) {
      homePressedAt = null;
      return controls.reset();
    }
    homePressedAt = now;
  };

  const arrow = (event: KeyboardEvent, direction: Direction, plain: () => void) => () => {
    if (event.altKey) seekTo(targets.word(from(), direction));
    else if (event.shiftKey) seekTo(targets.namedEvent(from(), direction));
    else plain();
  };

  const actionFor = (event: KeyboardEvent): (() => void) | undefined => {
    switch (event.key) {
      case " ":
      case "PageDown":
        return togglePlay;
      case "ArrowRight":
        return arrow(event, "forward", togglePlay);
      case "PageUp":
        return sentenceBack;
      case "ArrowLeft":
        return arrow(event, "back", sentenceBack);
      case "[":
        return () => seekTo(targets.paragraph(from(), "back"));
      case "]":
        return () => seekTo(targets.paragraph(from(), "forward"));
      case "ArrowUp":
        return changeSpeed(SPEED_STEP);
      case "ArrowDown":
        return changeSpeed(-SPEED_STEP);
      case "0":
        return () => controls.setSpeed(1);
      case "Home":
        return backToStart;
    }
  };

  const onKey = (event: Event) => {
    const key = event as KeyboardEvent;
    if (key.metaKey || key.ctrlKey || isTyping(key.target)) return;
    const action = actionFor(key);
    if (!action) return;
    key.preventDefault();
    action();
  };

  target.addEventListener("keydown", onKey);
  return () => target.removeEventListener("keydown", onKey);
}
