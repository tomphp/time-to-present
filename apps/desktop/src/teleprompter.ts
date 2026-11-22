import { approachCue, type ApproachCueSettings, type Cue } from "./approach-cue";
import {
  leaveFullscreen,
  onAppFocus,
  onApproachCue,
  onFullscreenChanged,
  onPerformanceKey,
  onServerStatus,
  onSessionState,
  onStreamEvent,
  openInBrowser,
  pause,
  play,
  reset,
  seek,
  setSpeed,
  toggleFullscreen,
} from "./commands";
import { isCombined, mountCombinedPane } from "./combined-pane";
import { find } from "./dom";
import { asKeydown } from "./forwarded-key";
import { fullscreenHint } from "./fullscreen-hint";
import { fullscreenKey } from "./fullscreen-key";
import {
  applyAction,
  loadOptions,
  markerPlacements,
  mirrorFor,
  mirrorTransform,
  saveOptions,
  displayAction,
  isRepeatable,
  type DisplayAction,
} from "./display-options";
import { formatElapsed } from "./recording-bar-view";
import {
  clockIcon,
  connectionSummary,
  endedSummary,
  eventTicks,
  FOCUS_WARNING,
  focusLost,
  foldRun,
  NO_APP_WARNING,
  NOT_STARTED,
  playNeedsConfirmation,
  progress,
  remaining,
  speedChanged,
  speedLabel,
} from "./performance-bar";
import { serverStatusView } from "./server-status-view";
import { sameLayout, scriptLayout } from "./script-view";
import type { ScriptWord, TimedEvent } from "./session";
import { navigation } from "./teleprompter-seek";
import {
  currentWord,
  followClock,
  heldFreeScroll,
  isOver,
  keyCommand,
  scriptTimeAt,
  scrollFreely,
  scrollTo,
  UNFOLLOWED,
  wordLook,
  type FreeScroll,
  type Scroll,
} from "./teleprompter-view";

const SCROLL_EASE = "transform 200ms ease";

const column = find<HTMLElement>("#column");
const paused = find<HTMLParagraphElement>("#paused");
const stage = find<HTMLDivElement>("#stage");
const pane = find<HTMLElement>("#pane");
const prompter = find<HTMLElement>("#prompter");
const screenKey = () => `${screen.width}x${screen.height}@${devicePixelRatio}`;
const FLASH = "fired";

let options = loadOptions(localStorage);
let layoutKey = "";

const bar = {
  warning: find<HTMLParagraphElement>("#bar-warning"),
  state: find<HTMLSpanElement>("#bar-state"),
  elapsed: find<HTMLSpanElement>("#bar-elapsed"),
  remaining: find<HTMLSpanElement>("#bar-remaining"),
  progress: find<HTMLElement>("#bar-progress"),
  fill: find<HTMLElement>("#bar-fill"),
  speed: find<HTMLSpanElement>("#bar-speed"),
  ended: find<HTMLSpanElement>("#bar-ended"),
  url: find<HTMLSpanElement>("#bar-url"),
  copy: find<HTMLButtonElement>("#bar-copy"),
  open: find<HTMLButtonElement>("#bar-open"),
  apps: find<HTMLSpanElement>("#bar-apps"),
  notice: find<HTMLParagraphElement>("#bar-notice"),
};

const end = document.createElement("p");
end.id = "end";
end.textContent = "END";

let words: ScriptWord[] = [];
let scriptEnd = 0;
let connectedApps = 0;
let noAppWarned = false;
let focused = document.hasFocus();
let run = NOT_STARTED;
let ticks: HTMLElement[] = [];
let events: TimedEvent[] = [];
let armedHome: number | null = null;
let spans: HTMLSpanElement[] = [];
let followed = UNFOLLOWED;
let current: number | null = null;
let scroll: Scroll | null = null;
let free: FreeScroll | null = null;
let cueSettings: ApproachCueSettings | null = null;
let cue: Cue | null = null;

function marker({ id, name }: { id: string; name: string }) {
  const element = document.createElement("small");
  element.className = "marker";
  element.dataset.event = id;
  element.textContent = name;
  return element;
}

function renderScript(next: ScriptWord[], nextEvents: TimedEvent[]) {
  const placements = markerPlacements(next, nextEvents);
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
  current = null;
  cue = null;
  scroll = null;
  highlight(null);
}

function highlight(next: number | null) {
  current = next;
  spans.forEach((span, index) => (span.className = wordLook(index, next)));
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
function follow(target: HTMLElement) {
  const next = scrollTo(scroll, { top: target.offsetTop, free: free?.offset ?? 0, jumps: followed.jumps });
  if (next === scroll) return;
  scroll = next;
  const offset = options.readingLine * stage.clientHeight - (target.offsetTop + target.offsetHeight / 2) - next.free;
  column.style.transition = next.animate ? SCROLL_EASE : "none";
  column.style.transform = `translateY(${offset}px)`;
}

function renderTicks() {
  ticks.forEach((tick) => tick.remove());
  ticks = eventTicks(events, scriptEnd).map((position, index) => {
    const tick = document.createElement("i");
    tick.title = events[index].name;
    tick.style.left = `${position * 100}%`;
    bar.progress.append(tick);
    return tick;
  });
}

function renderWarning() {
  const warning = focusLost(followed.state, focused) ? FOCUS_WARNING : noAppWarned ? NO_APP_WARNING : "";
  bar.warning.textContent = warning;
  bar.warning.hidden = warning === "";
}

function renderBar(scriptTime: number) {
  const ended = followed.state === "ended";
  bar.state.textContent = clockIcon(followed.state);
  bar.elapsed.textContent = formatElapsed(scriptTime);
  bar.remaining.textContent = remaining(scriptTime, scriptEnd, followed.speed);
  bar.fill.style.width = `${progress(scriptTime, scriptEnd) * 100}%`;
  bar.speed.textContent = speedLabel(followed.speed);
  bar.speed.classList.toggle("changed", speedChanged(followed.speed));
  bar.ended.hidden = !ended;
  bar.ended.textContent = endedSummary(run, scriptEnd);
  renderWarning();
}

function frame() {
  const at = performance.now();
  const scriptTime = scriptTimeAt(followed, at);
  renderBar(scriptTime);
  const over = isOver(followed, at);
  const next = over ? words.length : currentWord(words, followed.state, scriptTime);
  if (next !== current) highlight(next);
  showCue(cueSettings && approachCue(words, followed, scriptTime, cueSettings));
  end.classList.toggle("over", over);
  free = heldFreeScroll(free, followed);
  const target = over ? end : spans[current ?? 0];
  if (target) follow(target);
  requestAnimationFrame(frame);
}

function navigate(event: KeyboardEvent) {
  const now = performance.now();
  const position = { words, events, scriptTime: scriptTimeAt(followed, now), speed: followed.speed };
  const command = navigation(event, position, armedHome, now);
  armedHome = command === "armHome" ? now : null;
  if (command === "reset") void reset().catch(console.error);
  else if (command && command !== "armHome" && "seek" in command) void seek(command.seek).catch(console.error);
  else if (command && command !== "armHome") void setSpeed(command.speed).catch(console.error);
  return command !== null;
}

/** Scrolling never moves the clock: it only looks ahead or back while the clock stands still. */
function scrollFreelyBy(delta: number) {
  const target = spans[current ?? 0];
  if (!target) return;
  free = scrollFreely(free, followed, delta, { min: -target.offsetTop, max: column.offsetHeight - target.offsetTop });
}

function onKey(event: KeyboardEvent) {
  const fullscreen = fullscreenKey(event);
  if (fullscreen) {
    event.preventDefault();
    if (!event.repeat) void (fullscreen === "toggle" ? toggleFullscreen() : leaveFullscreen()).catch(console.error);
    return;
  }
  const action = displayAction(event);
  if (action) {
    event.preventDefault();
    if (!event.repeat || isRepeatable(action)) perform(action);
    return;
  }
  if (!followed.state || (event.repeat && event.key === "Home")) return;
  const modified = event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
  const toggle = modified ? null : keyCommand(event.key, followed.state);
  if (toggle) {
    armedHome = null;
    event.preventDefault();
    if (event.repeat) return;
    if (toggle === "play" && playNeedsConfirmation(followed.state, connectedApps, noAppWarned)) noAppWarned = true;
    else void (toggle === "play" ? play() : pause()).catch(console.error);
  } else if (navigate(event)) event.preventDefault();
}

function applyOptions() {
  const mirror = mirrorFor(options, screenKey());
  document.body.classList.toggle("markers-hidden", !options.markers);
  document.body.style.fontSize = `${options.fontSize}px`;
  document.body.style.setProperty("--reading-line", String(options.readingLine));
  const [mirrored, upright] = isCombined() ? [prompter, pane] : [pane, prompter];
  mirrored.style.transform = mirrorTransform(mirror);
  upright.style.transform = "";
  scroll = null;
}

function flash(id: string) {
  const element = column.querySelector<HTMLElement>(`[data-event="${id}"]`);
  if (!element) return;
  element.classList.remove(FLASH);
  element.getBoundingClientRect();
  element.classList.add(FLASH);
}

function perform(action: DisplayAction) {
  if (action === "blank") return void stage.classList.toggle("blanked");
  options = applyAction(options, action, screenKey());
  saveOptions(localStorage, options);
  applyOptions();
}

document.addEventListener("wheel", (event) => scrollFreelyBy(event.deltaY), { passive: true });

new ResizeObserver(() => (scroll = null)).observe(column);
mountCombinedPane(applyOptions);

window.addEventListener("resize", applyOptions);
document.addEventListener("keydown", onKey);
onPerformanceKey((key) => onKey(asKeydown(key)));
onAppFocus((appFocused) => (focused = appFocused));
bar.copy.addEventListener("click", () => void navigator.clipboard.writeText(bar.url.textContent ?? "").catch(console.error));
bar.open.addEventListener("click", () => void openInBrowser().catch(console.error));

onServerStatus((status) => {
  const view = serverStatusView(status);
  const { url, apps } = connectionSummary(status);
  bar.url.textContent = url;
  bar.apps.textContent = apps;
  bar.notice.textContent = view.notices.join(" · ");
  bar.notice.hidden = view.notices.length === 0;
  connectedApps = status.connectedApps;
  if (connectedApps > 0) noAppWarned = false;
});

onSessionState((state) => {
  events = state.namedEvents;
  scriptEnd = state.scriptEnd;
  renderTicks();
  renderScript(state.words, state.namedEvents);
});
void onStreamEvent((event) => {
  const at = performance.now();
  followed = followClock(followed, event, at);
  run = foldRun(run, event, at);
  if (event.type === "namedEvent") flash(event.id);
  if (followed.state !== "ready") noAppWarned = false;
  paused.hidden = followed.state !== "paused";
});
applyOptions();
onApproachCue((settings) => (cueSettings = settings));
const hint = find<HTMLParagraphElement>("#fullscreen-hint");
onFullscreenChanged(
  fullscreenHint((state) => {
    hint.hidden = state === "hidden";
    hint.classList.toggle("fading", state === "fading");
  }),
);
requestAnimationFrame(frame);
