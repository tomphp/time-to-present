import { approachCue, type ApproachCueSettings } from "./approach-cue";
import {
  leaveFullscreen,
  onAppFocus,
  onApproachCue,
  onFullscreenChanged,
  onMenuCommand,
  onPerformanceKey,
  onServerStatus,
  onSessionState,
  onStreamEvent,
  openInBrowser,
  pause,
  play,
  reportMenuState,
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
  DEFAULT_OPTIONS,
  mirrorFor,
  mirrorTransform,
  displayAction,
  isDisplayAction,
  isRepeatable,
  type DisplayOptions,
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
import type { ScriptWord, TimedEvent } from "./session";
import { mountDisplay } from "./teleprompter-display";
import { mountPage } from "./teleprompter-page";
import { navigation } from "./teleprompter-seek";
import {
  currentWord,
  followClock,
  isOver,
  keyCommand,
  scriptTimeAt,
  UNFOLLOWED,
} from "./teleprompter-view";

const column = find<HTMLElement>("#column");
const paused = find<HTMLParagraphElement>("#paused");
const stage = find<HTMLDivElement>("#stage");
const pane = find<HTMLElement>("#pane");
const prompter = find<HTMLElement>("#prompter");
const renderer = mountPage(column, stage);
const screenKey = () => `${screen.width}x${screen.height}@${devicePixelRatio}`;

let options: DisplayOptions = { ...DEFAULT_OPTIONS };

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

let words: ScriptWord[] = [];
let scriptEnd = 0;
let connectedApps = 0;
let noAppWarned = false;
let focused = document.hasFocus();
let run = NOT_STARTED;
let ticks: HTMLElement[] = [];
let events: TimedEvent[] = [];
let armedHome: number | null = null;
let followed = UNFOLLOWED;
let cueSettings: ApproachCueSettings | null = null;

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
  renderer.show({
    current: over ? words.length : currentWord(words, followed.state, scriptTime),
    over,
    cue: cueSettings && approachCue(words, followed, scriptTime, cueSettings),
    clock: followed,
    readingLine: options.readingLine,
  });
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
  renderer.invalidateScroll();
}

document.addEventListener("wheel", (event) => renderer.scrollFreelyBy(event.deltaY, followed), { passive: true });

const display = mountDisplay({
  storage: localStorage,
  screenKey,
  render(next, blanked) {
    stage.classList.toggle("blanked", blanked);
    if (next === options) return;
    options = next;
    applyOptions();
  },
  report: (report) => void reportMenuState(report).catch(console.error),
});
const perform = display.perform;
mountCombinedPane(applyOptions);
onMenuCommand((command) => {
  if (isDisplayAction(command)) perform(command);
});

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
  words = state.words;
  renderer.render(state.words, state.namedEvents);
});
void onStreamEvent((event) => {
  const at = performance.now();
  followed = followClock(followed, event, at);
  run = foldRun(run, event, at);
  if (event.type === "namedEvent") renderer.flash(event.id);
  if (followed.state !== "ready") noAppWarned = false;
  paused.hidden = followed.state !== "paused";
});
onApproachCue((settings) => (cueSettings = settings));
const hint = find<HTMLParagraphElement>("#fullscreen-hint");
onFullscreenChanged(
  fullscreenHint((state) => {
    hint.hidden = state === "hidden";
    hint.classList.toggle("fading", state === "fading");
  }),
);
requestAnimationFrame(frame);
