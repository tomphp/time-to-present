import type { Cue } from "./approach-cue";
import type { ScriptWord, TimedEvent } from "./session";
import { endMark, flashMarker, lookWords, marker, type TeleprompterRenderer } from "./teleprompter-renderer";
import { heldFreeScroll, scrollFreely, type FreeScroll } from "./teleprompter-view";
import { breakMarkX, freeScrollRange, stripX, tickerGeometry, type Ticker } from "./ticker-geometry";

const NORMAL_SPACE = " ";
const PILCROW = "¶";

interface Placed<T> {
  at: T;
  element: HTMLElement;
}

function breakMark() {
  const element = document.createElement("span");
  element.className = "break-mark";
  element.textContent = PILCROW;
  return element;
}

/** The Words on one line, each reaching the Read Mark at its start. */
export function mountTicker(column: HTMLElement, stage: HTMLElement): TeleprompterRenderer {
  const end = endMark();
  const space = document.createElement("span");
  space.className = "space";
  space.textContent = NORMAL_SPACE;

  let scriptKey = "";
  let words: ScriptWord[] = [];
  let scriptEnd = 0;
  let spans: HTMLSpanElement[] = [];
  let breaks: Placed<number>[] = [];
  let markers: Placed<number>[] = [];
  let current: number | null = null;
  let countdown: HTMLSpanElement | null = null;
  let geometry: Ticker | null = null;
  let scriptTime = 0;
  let free: FreeScroll | null = null;

  function highlight(next: number | null) {
    current = next;
    lookWords(spans, next);
  }

  /** Only a Long Gap's countdown shows on the Ticker: the underline fill is the Page's. */
  function showCountdown(cue: Cue | null) {
    countdown?.classList.remove("long-gap");
    countdown = cue?.countdown == null ? null : (spans[cue.word] ?? null);
    if (!cue || !countdown) return;
    countdown.classList.add("long-gap");
    countdown.dataset.countdown = String(cue.countdown);
  }

  function layOut(): Ticker {
    const measured = words.map(({ start }, index) => ({ start, textWidth: spans[index].offsetWidth }));
    const placed = tickerGeometry(measured, scriptEnd, space.offsetWidth);
    placed.words.forEach(({ left }, index) => (spans[index].style.left = `${left}px`));
    breaks.forEach(({ at, element }) => (element.style.left = `${breakMarkX(placed.words[at])}px`));
    markers.forEach(({ at, element }) => (element.style.left = `${stripX(placed, at)}px`));
    end.style.left = `${placed.end}px`;
    return placed;
  }

  return {
    render(next: ScriptWord[], events: TimedEvent[], nextEnd: number) {
      const key = JSON.stringify([
        next.map(({ text, start, breakAfter }) => [text, start, breakAfter]),
        events.map(({ id, name, time }) => [id, name, time]),
        nextEnd,
      ]);
      if (key === scriptKey) return;
      scriptKey = key;
      words = next;
      scriptEnd = nextEnd;
      spans = next.map(({ text }) => {
        const span = document.createElement("span");
        span.textContent = text;
        return span;
      });
      breaks = next.flatMap(({ breakAfter }, at) => (breakAfter === "paragraph" ? [{ at, element: breakMark() }] : []));
      markers = events.map((event) => ({ at: event.time, element: marker(event) }));
      const placed = [...breaks, ...markers].map(({ element }) => element);
      column.replaceChildren(...spans, ...placed, end, space);
      geometry = null;
      countdown = null;
      highlight(null);
    },

    show(frame) {
      if (frame.current !== current) highlight(frame.current);
      showCountdown(frame.cue);
      end.classList.toggle("over", frame.over);
      geometry ??= layOut();
      scriptTime = frame.scriptTime;
      free = heldFreeScroll(free, frame.clock);
      const x = frame.readMark * stage.clientWidth - stripX(geometry, scriptTime) - (free?.offset ?? 0);
      column.style.transform = `translateX(${x}px)`;
    },

    scrollFreelyBy({ deltaX, deltaY }, clock) {
      if (!geometry) return;
      free = scrollFreely(free, clock, deltaX + deltaY, freeScrollRange(geometry, scriptTime));
    },

    invalidateScroll() {
      geometry = null;
    },

    flash(id) {
      flashMarker(column, id);
    },

    destroy() {
      column.replaceChildren();
      column.style.transform = "";
    },
  };
}
