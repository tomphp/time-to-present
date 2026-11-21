import { forwardKey, onPerformanceSettings, onServerStatus } from "./commands";
import { dividerShare, letterbox, loadCombined, paneWidths, saveCombined, swapSides } from "./combined-layout";
import { find } from "./dom";

const DIVIDER_WIDTH = 10;

const views = find<HTMLDivElement>("#views");
const slot = find<HTMLDivElement>("#app-slot");
const frame = find<HTMLIFrameElement>("#app-frame");
const divider = find<HTMLDivElement>("#divider");
const swap = find<HTMLButtonElement>("#bar-swap");
const bar = find<HTMLElement>("#bar");

let combined = loadCombined(localStorage);
let active = false;
let appUrl = "";
let loaded = "";

export const isCombined = () => active;

function place() {
  document.body.classList.toggle("app-right", combined.side === "right");
  if (!active) return;
  const { app } = paneWidths(views.clientWidth, combined.share, DIVIDER_WIDTH);
  const box = letterbox({ width: app, height: views.clientHeight });
  slot.style.width = `${app}px`;
  Object.assign(frame.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
}

/** Only a Combined Performance loads the app, so another layout never counts an app that is not there. */
function loadApp() {
  const wanted = active ? appUrl : "";
  if (wanted === loaded) return;
  loaded = wanted;
  if (wanted) frame.src = wanted;
  else frame.removeAttribute("src");
}

function remember(next: typeof combined) {
  combined = next;
  saveCombined(localStorage, combined);
  place();
}

function drag(event: PointerEvent) {
  const left = views.getBoundingClientRect().left;
  remember({ ...combined, share: dividerShare(event.clientX - left, views.clientWidth, combined.side) });
}

/** The Combined Performance Layout: the Presentation App beside the Teleprompter in this one window. */
export function mountCombinedPane(onChange: () => void) {
  const show = (layout: string) => {
    active = layout === "combined";
    document.body.classList.toggle("combined", active);
    for (const element of [slot, divider, swap]) element.hidden = !active;
    loadApp();
    place();
    onChange();
  };
  onPerformanceSettings(({ layout }) => show(layout));
  onServerStatus(({ url }) => {
    appUrl = url;
    loadApp();
  });
  swap.addEventListener("click", () => {
    remember(swapSides(combined));
    onChange();
  });
  divider.addEventListener("pointerdown", (event) => divider.setPointerCapture(event.pointerId));
  divider.addEventListener("pointermove", (event) => divider.hasPointerCapture(event.pointerId) && drag(event));
  const resized = new ResizeObserver(() => {
    document.documentElement.style.setProperty("--bar-height", `${bar.offsetHeight}px`);
    place();
    onChange();
  });
  resized.observe(views);
  resized.observe(bar);
  window.addEventListener("message", ({ source, data }) => {
    if (source === frame.contentWindow && data?.forwardedKey) void forwardKey(data.forwardedKey).catch(console.error);
  });
}
