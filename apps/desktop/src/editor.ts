import {
  copy,
  cut,
  discardTranscription,
  drag,
  edit,
  nudge,
  onSessionState,
  paste,
  recordingWaveform,
  redo,
  renamePresentation,
  retryTranscription,
  selectEvent,
  undo,
} from "./commands";
import { mountEventEditor } from "./event-editor";
import { mountInspector } from "./inspector";
import { eventNames, nextMoved } from "./named-events";
import { mountRecordingBar } from "./recording-bar";
import { sharedSelection } from "./selection";
import type { SessionState } from "./session";
import { nudgeOf } from "./timing-controls";
import { mountTextPane } from "./text-pane";
import { mountTimeline } from "./timeline";

const title = document.querySelector<HTMLInputElement>("#title")!;
let savedTitle = "";
let current: SessionState | null = null;
let selected: string | null = null;

const selection = sharedSelection((ids) => {
  timeline.select(ids);
  showInspector();
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

const inspector = mountInspector(document.querySelector<HTMLFormElement>("#inspector")!, { edit });

const recordingBar = mountRecordingBar(pane.insertionPoint);

const error = document.querySelector<HTMLParagraphElement>("#error")!;

function showError(reason: unknown) {
  error.textContent = String(reason);
  error.hidden = false;
}

script.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLElement>("[data-retry], [data-discard]");
  const recording = button?.closest<HTMLElement>("[data-recording-id]")?.dataset.recordingId;
  if (!button || !recording) return;
  event.preventDefault();
  const command = "retry" in button.dataset ? retryTranscription : discardTranscription;
  command(recording).catch(showError);
});

title.addEventListener("change", async () => {
  error.hidden = true;
  await renamePresentation(title.value).catch((reason) => {
    showError(reason);
    title.value = savedTitle;
  });
});

title.addEventListener("keydown", (event) => {
  if (event.key === "Enter") title.blur();
});

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
    const timing = !field && !event.metaKey && !event.ctrlKey && word && nudgeOf(event, word);
    if (!timing) return;
    event.preventDefault();
    event.stopPropagation();
    void nudge(timing.run, timing.edit).catch(console.error);
  },
  true,
);

function showInspector() {
  const event = current?.namedEvents.find((named) => named.id === selected) ?? null;
  inspector.render(current?.words ?? [], selection.ids(), event);
}

/** Selecting a Named Event opens it in the event editor and clears its Moved badge. */
function select(id: string | null) {
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
  if (selected && !state.namedEvents.some((event) => event.id === selected)) eventEditor.close();
  selection.update(state.words);
  pane.render(state);
  showInspector();
  timeline.render(state.words, state.namedEvents, state.movedEvents, state.scriptEnd, selection.ids());
  recordingBar.render(state.recordingBar);
}

onSessionState(render);
