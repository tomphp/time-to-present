import { SCRIPT_START, type Edit, type ScriptWord, type Waveform } from "./session";

const PX_PER_SECOND = 200;
const EDGE_PX = 6;
export const MIN_BLOCK_PX = 6;

export interface Block {
  id: string;
  left: number;
  width: number;
}

export type Grip = "start" | "body" | "end";

export interface Hit {
  word: string;
  grip: Grip;
}

export const xOf = (ms: number) => (ms * PX_PER_SECOND) / 1000;

export const msAt = (x: number) => (x * 1000) / PX_PER_SECOND;

/** A Block per Word at its Script Time, as wide as it lasts but never narrower than can be seen and picked. */
export const timelineBlocks = (words: ScriptWord[]): Block[] =>
  words.map(({ id, start, duration }) => ({ id, left: xOf(start), width: Math.max(xOf(duration), MIN_BLOCK_PX) }));

export function secondTicks(scriptEnd: number): number[] {
  return Array.from({ length: Math.floor(scriptEnd / 1000) + 1 }, (_, second) => second * 1000);
}

/** What the pointer at `x` would drag: the block under it, or failing that the nearest edge close by. */
export function hitTest(blocks: Block[], x: number): Hit | null {
  const under = blocks.find((block) => block.left <= x && x < block.left + block.width);
  if (under) return { word: under.id, grip: gripWithin(under, x) };
  let nearest: (Hit & { distance: number }) | null = null;
  for (const block of blocks) {
    const edges: [Grip, number][] = [
      ["start", block.left - x],
      ["end", x - (block.left + block.width)],
    ];
    for (const [grip, distance] of edges) {
      if (distance >= 0 && distance <= EDGE_PX && (!nearest || distance < nearest.distance)) {
        nearest = { word: block.id, grip, distance };
      }
    }
  }
  return nearest && { word: nearest.word, grip: nearest.grip };
}

function gripWithin(block: Block, x: number): Grip {
  const edge = Math.min(EDGE_PX, block.width / 4);
  if (x < block.left + edge) return "start";
  if (x >= block.left + block.width - edge) return "end";
  return "body";
}

const DRAG_KINDS = { body: "move", start: "trimStart", end: "trimEnd" } as const;

/** The edit for a whole drag so far, `dx` pixels from where it began. */
export const dragEdit = ({ word, grip }: Hit, dx: number): Edit => ({
  kind: DRAG_KINDS[grip],
  word,
  by: Math.round(msAt(dx)),
});

/**
 * The edit re-anchoring a flag at Script Time `time` for a whole drag so far, `dx` pixels from where
 * it began: to the nearest Word start, either side, keeping the signed offset from it.
 */
export function flagDragEdit(words: ScriptWord[], { id, time }: { id: string; time: number }, dx: number): Edit {
  const target = Math.max(0, time + Math.round(msAt(dx)));
  let nearest: ScriptWord | undefined;
  for (const word of words) {
    if (!nearest || Math.abs(word.start - target) < Math.abs(nearest.start - target)) nearest = word;
  }
  return nearest
    ? { kind: "moveEvent", event: id, anchor: nearest.id, offset: target - nearest.start }
    : { kind: "moveEvent", event: id, anchor: SCRIPT_START, offset: target };
}

/**
 * The height, 0 to 1, of each of `columns` bars drawing the Word's own audio at Script Time
 * scale, unstretched as it plays, with silence where its audio has run out.
 */
export function waveformBars({ bucket, peaks }: Waveform, word: ScriptWord, columns: number): number[] {
  const { audioStart, audioEnd } = word;
  if (audioStart === null || audioEnd === null) return [];
  return Array.from({ length: columns }, (_, column) => {
    const from = audioStart + msAt(column);
    if (from >= audioEnd) return 0;
    const to = Math.min(audioEnd, audioStart + msAt(column + 1));
    const first = Math.floor(from / bucket);
    return Math.max(0, ...peaks.slice(first, Math.max(first + 1, Math.ceil(to / bucket))));
  });
}
