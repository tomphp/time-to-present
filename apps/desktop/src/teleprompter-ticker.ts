import type { ScriptWord } from "./session";
import { endMark, lookWords, type TeleprompterRenderer } from "./teleprompter-renderer";
import { stripX, tickerGeometry, type Ticker } from "./ticker-geometry";

const NORMAL_SPACE = " ";

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
  let current: number | null = null;
  let geometry: Ticker | null = null;

  function highlight(next: number | null) {
    current = next;
    lookWords(spans, next);
  }

  function layOut(): Ticker {
    const measured = words.map(({ start }, index) => ({ start, textWidth: spans[index].offsetWidth }));
    const placed = tickerGeometry(measured, scriptEnd, space.offsetWidth);
    placed.words.forEach(({ left }, index) => (spans[index].style.left = `${left}px`));
    end.style.left = `${placed.end}px`;
    return placed;
  }

  return {
    render(next, _events, nextEnd) {
      const key = JSON.stringify([next.map(({ text, start }) => [text, start]), nextEnd]);
      if (key === scriptKey) return;
      scriptKey = key;
      words = next;
      scriptEnd = nextEnd;
      spans = next.map(({ text }) => {
        const span = document.createElement("span");
        span.textContent = text;
        return span;
      });
      column.replaceChildren(...spans, end, space);
      geometry = null;
      highlight(null);
    },

    show(frame) {
      if (frame.current !== current) highlight(frame.current);
      end.classList.toggle("over", frame.over);
      geometry ??= layOut();
      const x = frame.readMark * stage.clientWidth - stripX(geometry, frame.scriptTime);
      column.style.transform = `translateX(${x}px)`;
    },

    scrollFreelyBy() {},

    invalidateScroll() {
      geometry = null;
    },

    flash() {},

    destroy() {
      column.replaceChildren();
      column.style.transform = "";
    },
  };
}
