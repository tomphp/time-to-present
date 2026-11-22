import { mountClockControl } from "./clock-control";
import {
  copy,
  cut,
  discardTranscription,
  removeUnusedRecordings,
  drag,
  edit,
  nudge,
  onMenuCommand,
  onSessionState,
  paste,
  recordingWaveform,
  redo,
  renamePresentation,
  reportMenuState,
  retryTranscription,
  selectEvent,
  startPerformance,
  undo,
} from "./commands";
import { editorMenu } from "./editor-menu";
import { mountEventEditor } from "./event-editor";
import { mountInspector } from "./inspector";
import { eventNames, nextMoved } from "./named-events";
import { onPendingAction } from "./pending-passage";
import { mountPerformMenu } from "./perform-menu";
import { mountPreview } from "./preview-controls";
import { mountRecordingBar } from "./recording-bar";
import { act, showError } from "./report-error";
import { sharedSelection } from "./selection";
import { mountServerStatus } from "./server-status";
import type { ClockState, SessionState } from "./session";
import { nudgeOf } from "./timing-controls";
import { mountTextPane } from "./text-pane";
import { mountTimeline } from "./timeline";

const title = document.querySelector<HTMLInputElement>("#title")!;
let savedTitle = "";
let current: SessionState | null = null;
let selected: string | null = null;
let clockState: ClockState | null = null;

const selection = sharedSelection((ids) => {
  timeline.select(ids);
  showInspector();
  previewControls.selectionChanged();
  menu.changed();
});

const script = document.querySelector<HTMLElement>("#script")!;
const pane = mountTextPane(
  script,
  { edit, cut, copy, paste, undo, redo },
  {
    insertEventAt: (at) => {
      select(null);
      eventEditor.open({ kind: "new", at });
    },
    selectEvent: select,
  },
  selection.fromText,
);
const eventEditor = mountEventEditor(document.querySelector<HTMLFormElement>("#event-editor")!, {
  edit,
  names: () => eventNames(current?.namedEvents ?? []),
  closed: () => {
    select(null);
    pane.focus();
  },
});

const timeline = mountTimeline(
  document.querySelector<HTMLElement>("#timeline")!,
  { drag, waveform: recordingWaveform },
  (word, extend) => {
    const range = selection.fromTimeline(word, extend);
    if (range) pane.select(range);
  },
  select,
);

const previewControls = mountPreview({
  selected: selection.ids,
  insertionPoint: pane.insertionPoint,
  highlight: pane.highlight,
  playhead: timeline.playhead,
});

const inspector = mountInspector(document.querySelector<HTMLFormElement>("#inspector")!, { edit });

const recordingBar = mountRecordingBar(pane.recordingTarget);

onPendingAction(script, {
  retry: (recording) => retryTranscription(recording).catch(showError),
  discard: (recording) => discardTranscription(recording).catch(showError),
});

const removeUnused = () => void removeUnusedRecordings().catch(showError);
document.querySelector("#remove-unused")!.addEventListener("click", removeUnused);

title.addEventListener(
  "change",
  act(() =>
    renamePresentation(title.value).catch((reason) => {
      title.value = savedTitle;
      throw reason;
    }),
  ),
);

title.addEventListener("keydown", (event) => {
  if (event.key === "Enter") title.blur();
});

const performMenu = mountPerformMenu();

document.querySelector("#perform")!.addEventListener("click", act(startPerformance));

const clock = mountClockControl((panel, event) => {
  previewControls.clock(panel, event);
  clockState = panel.state;
  menu.changed();
});

const menu = editorMenu(
  {
    removeUnusedRecordings: removeUnused,
    record: recordingBar.toggle,
    reRecordSelection: recordingBar.reRecord,
    retime: inspector.retime,
    listen: previewControls.listen,
    layoutTwoWindows: () => performMenu.chooseLayout("twoWindows"),
    layoutCombined: () => performMenu.chooseLayout("combined"),
    layoutTeleprompterOnly: () => performMenu.chooseLayout("teleprompterOnly"),
    playPause: clock.playPause,
    playFromCursor: previewControls.playFromCursor,
    restart: clock.restart,
  },
  () => ({
    session: current,
    clock: clockState,
    target: pane.recordingTarget(),
    listenable: previewControls.listenable(),
  }),
  reportMenuState,
);
onMenuCommand(menu.run);
document.addEventListener("selectionchange", menu.changed);

document.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key !== "'" || !current) return;
  event.preventDefault();
  const next = nextMoved(current.namedEvents, current.movedEvents, selected);
  if (next) select(next);
});

document.addEventListener(
  "keydown",
  (event) => {
    const target = event.target as HTMLElement;
    const field = target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    const word = selection.ids()[0];
    const timing = !field && !current?.locked && !event.metaKey && !event.ctrlKey && word && nudgeOf(event, word);
    if (!timing) return;
    event.preventDefault();
    event.stopPropagation();
    void nudge(timing.run, timing.edit).catch(console.error);
  },
  true,
);

function showInspector() {
  const event = current?.namedEvents.find((named) => named.id === selected) ?? null;
  inspector.render(current?.words ?? [], selection.ids(), event, current?.locked ?? false);
}

/** Selecting a Named Event opens it in the event editor and clears its Moved badge. */
function select(id: string | null) {
  if (id && current?.locked) return;
  selected = id;
  pane.selectEvent(id);
  showInspector();
  const event = current?.namedEvents.find((named) => named.id === id);
  if (!event) return;
  eventEditor.open({ kind: "existing", event });
  void selectEvent(event.id).catch(console.error);
}

function render(state: SessionState) {
  current = state;
  savedTitle = state.title;
  document.title = state.title;
  title.value = state.title;
  if (state.locked || (selected && !state.namedEvents.some((event) => event.id === selected))) eventEditor.close();
  selection.update(state.words);
  pane.render(state);
  showInspector();
  timeline.render(state.words, state.namedEvents, state.movedEvents, state.scriptEnd, selection.ids(), state.locked);
  recordingBar.render(state.recordingBar);
  previewControls.render(state);
  menu.changed();
}

onSessionState(render);
mountServerStatus();
menu.changed();
