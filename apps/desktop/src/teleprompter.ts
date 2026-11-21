import { getCurrentWindow } from "@tauri-apps/api/window";
import { onSessionState, onStreamEvent, pause, play, reset, seek, setSpeed } from "./commands";
import { find } from "./dom";
import { sameLayout, scriptLayout } from "./script-view";
import type { ScriptWord, TimedEvent } from "./session";
import { navigation } from "./teleprompter-seek";
import {
  currentWord,
  followClock,
  keyCommand,
  scriptTimeAt,
  scrollTo,
  UNFOLLOWED,
  wordLook,
  type Scroll,
} from "./teleprompter-view";

const SCROLL_EASE = "transform 200ms ease";

const readingLine = find<HTMLSpanElement>("#reading-line");
const column = find<HTMLElement>("#column");
const paused = find<HTMLParagraphElement>("#paused");

let words: ScriptWord[] = [];
let events: TimedEvent[] = [];
let armedHome: number | null = null;
let spans: HTMLSpanElement[] = [];
let followed = UNFOLLOWED;
let current: number | null = null;
let scroll: Scroll | null = null;

function renderScript(next: ScriptWord[]) {
  const unchanged = sameLayout(words, next);
  words = next;
  if (unchanged && spans.length > 0) return;
  column.replaceChildren(
    ...scriptLayout(next).map((paragraph) => {
      const element = document.createElement("p");
      paragraph.forEach((line, index) => {
        if (index > 0) element.append(document.createElement("br"));
        line.forEach((word, position) => {
          if (position > 0) element.append(" ");
          const span = document.createElement("span");
          span.textContent = word.text;
          element.append(span);
        });
      });
      return element;
    }),
  );
  spans = [...column.querySelectorAll("span")];
  current = null;
  scroll = null;
  highlight(null);
}

function highlight(next: number | null) {
  current = next;
  spans.forEach((span, index) => (span.className = wordLook(index, next)));
}

/** Holds the current Word's line level with the Reading Line's chevron. */
function follow(target: HTMLSpanElement) {
  const next = scrollTo(scroll, target.offsetTop, followed.jumps);
  if (next === scroll) return;
  scroll = next;
  const { top, height } = readingLine.getBoundingClientRect();
  const offset = top + height / 2 - (target.offsetTop + target.offsetHeight / 2);
  column.style.transition = next.animate ? SCROLL_EASE : "none";
  column.style.transform = `translateY(${offset}px)`;
}

function frame() {
  const next = currentWord(words, followed.state, scriptTimeAt(followed, performance.now()));
  if (next !== current) highlight(next);
  const target = spans[current ?? 0];
  if (target) follow(target);
  requestAnimationFrame(frame);
}

function navigate(event: KeyboardEvent) {
  const now = performance.now();
  const position = { words, events, scriptTime: scriptTimeAt(followed, now), speed: followed.speed };
  const command = navigation(event, position, armedHome, now);
  armedHome = command === "armHome" ? now : null;
  if (command === "reset") void reset().catch(console.error);
  else if (command && command !== "armHome" && "seek" in command) void seek(command.seek).catch(console.error);
  else if (command && command !== "armHome") void setSpeed(command.speed).catch(console.error);
  return command !== null;
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") return void getCurrentWindow().setFullscreen(false).catch(console.error);
  if (!followed.state || (event.repeat && event.key === "Home")) return;
  const modified = event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
  const toggle = modified ? null : keyCommand(event.key, followed.state);
  if (toggle) {
    armedHome = null;
    event.preventDefault();
    if (!event.repeat) void (toggle === "play" ? play() : pause()).catch(console.error);
  } else if (navigate(event)) event.preventDefault();
});

new ResizeObserver(() => (scroll = null)).observe(column);

onSessionState((state) => {
  events = state.namedEvents;
  renderScript(state.words);
});
void onStreamEvent((event) => {
  followed = followClock(followed, event, performance.now());
  paused.hidden = followed.state !== "paused";
});
requestAnimationFrame(frame);
