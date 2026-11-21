import { getCurrentWindow } from "@tauri-apps/api/window";
import { onSessionState, onStreamEvent, pause, play } from "./commands";
import { find } from "./dom";
import { sameLayout, scriptLayout } from "./script-view";
import type { ScriptWord } from "./session";
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") return void getCurrentWindow().setFullscreen(false).catch(console.error);
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const command = keyCommand(event.key, followed.state);
  if (!command) return;
  event.preventDefault();
  void (command === "play" ? play() : pause()).catch(console.error);
});

new ResizeObserver(() => (scroll = null)).observe(column);

onSessionState((state) => renderScript(state.words));
void onStreamEvent((event) => {
  followed = followClock(followed, event, performance.now());
  paused.hidden = followed.state !== "paused";
});
requestAnimationFrame(frame);
