import { latestOnly } from "./latest-only";
import type { Edit, ScriptWord, SessionState, TimedEvent, Waveform } from "./session";
import { timelineBlock } from "./timeline-block";
import { dragEdit, flagDragEdit, hitTest, secondTicks, timelineBlocks, xOf, type Block } from "./timeline-geometry";

export interface TimelineCommands {
  drag(drag: string, edit: Edit): Promise<SessionState>;
  waveform(recording: string): Promise<Waveform>;
}

const TRAILING_PX = 200;
const FLAG_DRAG_PX = 3;
const CURSORS = { body: "grab", start: "ew-resize", end: "ew-resize" };

/**
 * The Script Time timeline: a block per Word at its Script Time. Clicking a block picks it,
 * dragging its body Moves it and dragging an edge Trims it, each drag one Session drag. A flag
 * per Named Event sits at its Script Time; clicking one picks it and dragging it re-anchors it.
 * Under the edit lock a click still picks, but nothing drags.
 */
export function mountTimeline(
  root: HTMLElement,
  commands: TimelineCommands,
  pick: (word: string, extend: boolean) => void,
  pickEvent: (event: string) => void,
) {
  const track = document.createElement("div");
  track.className = "track";
  const ticks = document.createElement("div");
  track.append(ticks);
  root.append(track);

  const blocks = new Map<string, ReturnType<typeof timelineBlock>>();
  const waveforms = new Map<string, Waveform | "loading" | "failed">();
  const flags = new Map<string, HTMLElement>();
  let words: ScriptWord[] = [];
  let events: TimedEvent[] = [];
  let laidOut: Block[] = [];
  let scriptEnd = 0;
  let selected = new Set<string>();
  let movedEvents = new Set<string>();
  let locked = false;
  let drag: { minPx?: number; startX: number; edit: (dx: number) => Edit; send: (edit: Edit) => void } | null = null;

  function render(next: ScriptWord[], nextEvents: TimedEvent[], moved: string[], end: number, ids: string[], lock: boolean) {
    words = next;
    events = nextEvents;
    movedEvents = new Set(moved);
    laidOut = timelineBlocks(words);
    scriptEnd = end;
    locked = lock;
    if (locked) drag = null;
    root.classList.toggle("locked", locked);
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
    paintFlags();
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

  function paintFlags() {
    const kept = new Set(events.map((event) => event.id));
    for (const [id, flag] of flags) {
      if (kept.has(id)) continue;
      flag.remove();
      flags.delete(id);
    }
    for (const event of events) {
      let flag = flags.get(event.id);
      if (!flag) {
        flag = document.createElement("div");
        flag.dataset.eventId = event.id;
        flags.set(event.id, flag);
        track.append(flag);
      }
      flag.className = movedEvents.has(event.id) ? "flag moved" : "flag";
      flag.style.left = `${xOf(event.time)}px`;
      flag.textContent = event.name;
    }
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

  const send = () => {
    const id = crypto.randomUUID();
    return latestOnly((edit: Edit) => commands.drag(id, edit).catch(console.error));
  };

  function dragFlag(event: PointerEvent, id: string) {
    const flagged = events.find((named) => named.id === id);
    if (!flagged) return;
    pickEvent(id);
    if (locked) return;
    track.setPointerCapture(event.pointerId);
    drag = { startX: event.clientX, edit: (dx) => flagDragEdit(words, flagged, dx), send: send(), minPx: FLAG_DRAG_PX };
  }

  track.addEventListener("pointerdown", (event) => {
    const flag = (event.target as Element).closest<HTMLElement>("[data-event-id]");
    if (flag && event.button === 0) {
      event.preventDefault();
      dragFlag(event, flag.dataset.eventId!);
      return;
    }
    const hit = event.button === 0 ? hitAt(event) : null;
    if (!hit) return;
    event.preventDefault();
    pick(hit.word, event.shiftKey);
    if (event.shiftKey || locked) return;
    track.setPointerCapture(event.pointerId);
    drag = { startX: event.clientX, edit: (dx) => dragEdit(hit, dx), send: send() };
  });

  track.addEventListener("pointermove", (event) => {
    if (drag) {
      const dx = event.clientX - drag.startX;
      if (Math.abs(dx) >= (drag.minPx ?? 0)) drag.send(drag.edit(dx));
      return;
    }
    const hit = locked ? null : hitAt(event);
    track.style.cursor = hit ? CURSORS[hit.grip] : "";
  });

  const endDrag = () => (drag = null);
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);

  return { render, select };
}
