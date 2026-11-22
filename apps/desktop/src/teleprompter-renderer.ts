import type { Cue } from "./approach-cue";
import type { ScriptWord, TimedEvent } from "./session";
import type { Followed } from "./teleprompter-view";

export interface ViewFrame {
  current: number | null;
  over: boolean;
  cue: Cue | null;
  clock: Followed;
  readingLine: number;
}

/** What the Teleprompter window drives each frame, whichever Teleprompter View is showing the Script. */
export interface TeleprompterRenderer {
  render(words: ScriptWord[], events: TimedEvent[]): void;
  show(frame: ViewFrame): void;
  /** Scrolling never moves the clock: it only looks ahead or back while the clock stands still. */
  scrollFreelyBy(delta: number, clock: Followed): void;
  invalidateScroll(): void;
  flash(id: string): void;
  destroy(): void;
}
