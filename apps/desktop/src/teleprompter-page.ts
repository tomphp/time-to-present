import type { Cue } from "./approach-cue";
import { markerPlacements } from "./display-options";
import { sameLayout, scriptLayout } from "./script-view";
import type { ScriptWord, TimedEvent } from "./session";
import {
  endMark,
  flashMarker,
  lookWords,
  marker,
  type TeleprompterRenderer,
  type ViewFrame,
} from "./teleprompter-renderer";
import {
  heldFreeScroll,
  scrollFreely,
  scrollTo,
  type FreeScroll,
  type Scroll,
} from "./teleprompter-view";

const SCROLL_EASE = "transform 200ms ease";
export function mountPage(column: HTMLElement, stage: HTMLElement): TeleprompterRenderer {
  const end = endMark();

  let words: ScriptWord[] = [];
  let layoutKey = "";
  let spans: HTMLSpanElement[] = [];
  let current: number | null = null;
  let cue: Cue | null = null;
  let scroll: Scroll | null = null;
  let free: FreeScroll | null = null;

  function highlight(next: number | null) {
    current = next;
    lookWords(spans, next);
  }

  function showCue(next: Cue | null) {
    const previous = cue && spans[cue.word];
    previous?.classList.remove("approaching", "long-gap");
    cue = next;
    const span = next && spans[next.word];
    if (!next || !span) return;
    span.classList.add("approaching");
    span.classList.toggle("long-gap", next.countdown !== null);
    span.style.setProperty("--fill", String(next.fill));
    span.dataset.countdown = String(next.countdown ?? "");
  }

  /** Holds the current Word's line level with the Reading Line's chevron, less any free scrolling. */
  function follow(target: HTMLElement, { clock, readingLine }: ViewFrame) {
    const next = scrollTo(scroll, { top: target.offsetTop, free: free?.offset ?? 0, jumps: clock.jumps });
    if (next === scroll) return;
    scroll = next;
    const offset = readingLine * stage.clientHeight - (target.offsetTop + target.offsetHeight / 2) - next.free;
    column.style.transition = next.animate ? SCROLL_EASE : "none";
    column.style.transform = `translateY(${offset}px)`;
  }

  const resizes = new ResizeObserver(() => (scroll = null));
  resizes.observe(column);

  return {
    render(next: ScriptWord[], events: TimedEvent[]) {
      const placements = markerPlacements(next, events);
      const key = JSON.stringify(placements);
      const unchanged = sameLayout(words, next) && key === layoutKey;
      words = next;
      layoutKey = key;
      if (unchanged && spans.length > 0) return;
      let index = 0;
      const markersBefore = (at: number) => placements.filter(({ before }) => before === at).map(marker);
      const paragraphs = scriptLayout(next).map((paragraph) => {
        const element = document.createElement("p");
        paragraph.forEach((line, row) => {
          if (row > 0) element.append(document.createElement("br"));
          line.forEach((word, position) => {
            if (position > 0) element.append(" ");
            element.append(...markersBefore(index));
            const span = document.createElement("span");
            span.textContent = word.text;
            element.append(span);
            index++;
          });
        });
        return element;
      });
      paragraphs.at(-1)?.append(...markersBefore(index));
      column.replaceChildren(...paragraphs, end);
      spans = [...column.querySelectorAll("span")];
      cue = null;
      scroll = null;
      highlight(null);
    },

    show(frame) {
      if (frame.current !== current) highlight(frame.current);
      showCue(frame.cue);
      end.classList.toggle("over", frame.over);
      free = heldFreeScroll(free, frame.clock);
      const target = frame.over ? end : spans[current ?? 0];
      if (target) follow(target, frame);
    },

    scrollFreelyBy({ deltaY }, clock) {
      const target = spans[current ?? 0];
      if (!target) return;
      free = scrollFreely(free, clock, deltaY, { min: -target.offsetTop, max: column.offsetHeight - target.offsetTop });
    },

    invalidateScroll() {
      scroll = null;
    },

    flash(id) {
      flashMarker(column, id);
    },

    destroy() {
      resizes.disconnect();
      column.replaceChildren();
      column.style.transform = "";
      column.style.transition = "";
    },
  };
}
