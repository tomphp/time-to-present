import { edit, onSessionState, redo, renamePresentation, selectEvent, undo } from "./commands";
import { mountEventEditor } from "./event-editor";
import { eventNames, nextMoved } from "./named-events";
import { renderRecordingBar } from "./recording-bar";
import type { SessionState } from "./session";
import { mountTextPane } from "./text-pane";

const title = document.querySelector<HTMLInputElement>("#title")!;
const pane = mountTextPane(
  document.querySelector<HTMLElement>("#script")!,
  { edit, undo, redo },
  {
    insertEventAt: (at) => {
      select(null);
      eventEditor.open({ kind: "new", at });
    },
    selectEvent: select,
  },
);
const eventEditor = mountEventEditor(document.querySelector<HTMLFormElement>("#event-editor")!, {
  edit,
  names: () => eventNames(current?.namedEvents ?? []),
  closed: () => {
    select(null);
    pane.focus();
  },
});

const error = document.querySelector<HTMLParagraphElement>("#error")!;

title.addEventListener("change", async () => {
  error.hidden = true;
  await renamePresentation(title.value).catch((reason) => {
    error.textContent = String(reason);
    error.hidden = false;
    title.value = savedTitle;
  });
});

title.addEventListener("keydown", (event) => {
  if (event.key === "Enter") title.blur();
});

document.addEventListener("keydown", (event) => {
  if (!event.metaKey || event.key !== "'" || !current) return;
  event.preventDefault();
  const next = nextMoved(current.namedEvents, current.movedEvents, selected);
  if (next) select(next);
});

let savedTitle = "";
let current: SessionState | null = null;
let selected: string | null = null;

/** Selecting a Named Event opens it in the event editor and clears its Moved badge. */
function select(id: string | null) {
  selected = id;
  pane.selectEvent(id);
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
  pane.render(state);
  renderRecordingBar(state.recordingBar);
}

onSessionState(render);
