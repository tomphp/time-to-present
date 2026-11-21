import { latestOnly } from "./latest-only";
import type { Edit, ScriptWord, SessionState, Waveform } from "./session";
import { timelineBlock } from "./timeline-block";
import { dragEdit, hitTest, secondTicks, timelineBlocks, xOf, type Block, type Hit } from "./timeline-geometry";

export interface TimelineCommands {
  drag(drag: string, edit: Edit): Promise<SessionState>;
  waveform(recording: string): Promise<Waveform>;
}

const TRAILING_PX = 200;
const CURSORS = { body: "grab", start: "ew-resize", end: "ew-resize" };

/**
 * The Script Time timeline: a block per Word at its Script Time. Clicking a block picks it,
 * dragging its body Moves it and dragging an edge Trims it, each drag one Session drag.
 */
export function mountTimeline(
  root: HTMLElement,
  commands: TimelineCommands,
  pick: (word: string, extend: boolean) => void,
) {
  const track = document.createElement("div");
  track.className = "track";
  const ticks = document.createElement("div");
  track.append(ticks);
  root.append(track);

  const blocks = new Map<string, ReturnType<typeof timelineBlock>>();
  const waveforms = new Map<string, Waveform | "loading" | "failed">();
  let words: ScriptWord[] = [];
  let laidOut: Block[] = [];
  let scriptEnd = 0;
  let selected = new Set<string>();
  let drag: { hit: Hit; startX: number; send: (edit: Edit) => void } | null = null;

  function render(next: ScriptWord[], end: number, ids: string[]) {
    words = next;
    laidOut = timelineBlocks(words);
    scriptEnd = end;
    select(ids);
  }

  function select(ids: string[]) {
    selected = new Set(ids);
    paint();
  }

  function paint() {
    track.style.width = `${xOf(scriptEnd) + TRAILING_PX}px`;
    paintTicks();
    const kept = new Set(words.map((word) => word.id));
    for (const [id, block] of blocks) {
      if (kept.has(id)) continue;
      block.element.remove();
      blocks.delete(id);
    }
    words.forEach((word, index) => {
      let block = blocks.get(word.id);
      if (!block) {
        block = timelineBlock(word.id);
        blocks.set(word.id, block);
        track.append(block.element);
      }
      block.update(word, laidOut[index], selected.has(word.id), waveformFor(word));
    });
  }

  function paintTicks() {
    const seconds = secondTicks(scriptEnd);
    if (ticks.childElementCount === seconds.length) return;
    ticks.replaceChildren(
      ...seconds.map((ms) => {
        const tick = document.createElement("span");
        tick.className = "tick";
        tick.style.left = `${xOf(ms)}px`;
        tick.textContent = `${ms / 1000}s`;
        return tick;
      }),
    );
  }

  /** The Recording's waveform once loaded; asking starts loading it. */
  function waveformFor({ recordingId }: ScriptWord): Waveform | null {
    if (!recordingId) return null;
    const known = waveforms.get(recordingId);
    if (known === undefined) {
      waveforms.set(recordingId, "loading");
      commands.waveform(recordingId).then(
        (waveform) => {
          waveforms.set(recordingId, waveform);
          paint();
        },
        (error) => {
          waveforms.set(recordingId, "failed");
          console.error(error);
        },
      );
    }
    return typeof known === "object" ? known : null;
  }

  const hitAt = (event: PointerEvent) =>
    hitTest(laidOut, event.clientX - track.getBoundingClientRect().left);

  track.addEventListener("mousedown", (event) => event.preventDefault());

  track.addEventListener("pointerdown", (event) => {
    const hit = event.button === 0 ? hitAt(event) : null;
    if (!hit) return;
    event.preventDefault();
    pick(hit.word, event.shiftKey);
    if (event.shiftKey) return;
    track.setPointerCapture(event.pointerId);
    const id = crypto.randomUUID();
    drag = { hit, startX: event.clientX, send: latestOnly((edit: Edit) => commands.drag(id, edit).catch(console.error)) };
  });

  track.addEventListener("pointermove", (event) => {
    if (drag) return drag.send(dragEdit(drag.hit, event.clientX - drag.startX));
    const hit = hitAt(event);
    track.style.cursor = hit ? CURSORS[hit.grip] : "";
  });

  const endDrag = () => (drag = null);
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);

  return { render, select };
}
