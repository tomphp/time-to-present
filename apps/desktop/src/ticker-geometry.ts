export interface MeasuredWord {
  start: number;
  textWidth: number;
}

export interface PlacedWord {
  start: number;
  slot: number;
  left: number;
  width: number;
}

/** Every Word on the Ticker strip, END after them, and the strip's px per ms of Script Time. */
export interface Ticker {
  words: PlacedWord[];
  end: number;
  scriptEnd: number;
  scale: number;
}

export function tickerGeometry(measured: MeasuredWord[], scriptEnd: number, spaceWidth: number): Ticker {
  const slots = measured.map(({ start }, index) => Math.max(0, (measured[index + 1]?.start ?? scriptEnd) - start));
  const minWidths = measured.map(({ textWidth }) => textWidth + spaceWidth);
  const scale = scaleOf(slots, minWidths);
  let left = 0;
  const words = measured.map(({ start }, index) => {
    const placed = { start, slot: slots[index], left, width: Math.max(slots[index] * scale, minWidths[index]) };
    left += placed.width;
    return placed;
  });
  return { words, end: left, scriptEnd, scale };
}

/** The median slot comes out as wide as the median Word with its space. */
function scaleOf(slots: number[], minWidths: number[]) {
  const timed = slots.filter((slot) => slot > 0);
  return timed.length === 0 ? 0 : median(minWidths) / median(timed);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The strip's x at the Read Mark at `scriptTime`. */
export function stripX({ words, end, scriptEnd, scale }: Ticker, scriptTime: number) {
  if (scriptTime >= scriptEnd || words.length === 0) return end;
  const upcoming = words.findIndex(({ start }) => start > scriptTime);
  if (upcoming === 0) return words[0].left - (words[0].start - scriptTime) * scale;
  const { start, slot, left, width } = words[(upcoming === -1 ? words.length : upcoming) - 1];
  return left + ((scriptTime - start) / slot) * width;
}

/** Free scrolling runs from the first Word's left edge to END's. */
export const freeScrollBounds = ({ words, end }: Ticker) => ({ from: words[0]?.left ?? 0, to: end });
