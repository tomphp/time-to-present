import { showAs } from "./icon-button";
import { TIMELINE_HEIGHTS } from "./layout-preferences";

export interface TimelineDockCommands {
  shownChanged(shown: boolean): void;
  heightChanged(height: number): void;
}

const KEY_STEP = 20;

/** The card docked at the bottom of the Editor around the timeline: resized by its top edge, collapsible. */
export function mountTimelineDock(
  card: HTMLElement,
  commands: TimelineDockCommands,
  initial: { shown: boolean; height: number },
) {
  const body = card.querySelector<HTMLElement>("[data-body]")!;
  const handle = card.querySelector<HTMLElement>("[data-resize]")!;
  const toggleButton = card.querySelector<HTMLButtonElement>("[data-toggle]")!;
  let { shown, height } = initial;

  const clamp = (value: number) => Math.min(TIMELINE_HEIGHTS.max, Math.max(TIMELINE_HEIGHTS.min, value));

  function setHeight(next: number) {
    height = clamp(next);
    card.style.setProperty("--timeline-h", `${height}px`);
    handle.setAttribute("aria-valuenow", String(height));
  }

  function setShown(next: boolean) {
    body.hidden = !next;
    handle.hidden = !next;
    showAs(toggleButton, { icon: "panel-bottom", label: next ? "Hide Timeline" : "Show Timeline" });
    if (next === shown) return;
    shown = next;
    commands.shownChanged(shown);
  }

  handle.setAttribute("aria-valuemin", String(TIMELINE_HEIGHTS.min));
  handle.setAttribute("aria-valuemax", String(TIMELINE_HEIGHTS.max));
  handle.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    const startY = down.clientY;
    const startHeight = height;
    const move = (event: MouseEvent) => setHeight(startHeight + startY - event.clientY);
    const end = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      commands.heightChanged(height);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
  });
  handle.addEventListener("keydown", (event) => {
    const step = { ArrowUp: KEY_STEP, ArrowDown: -KEY_STEP }[event.key];
    if (!step) return;
    event.preventDefault();
    setHeight(height + step);
    commands.heightChanged(height);
  });
  const toggle = () => setShown(!shown);
  toggleButton.addEventListener("click", toggle);
  setHeight(height);
  setShown(shown);

  return { toggle, shown: () => shown, height: () => height };
}
