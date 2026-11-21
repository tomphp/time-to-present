import { edit, onSessionState, redo, renamePresentation, undo } from "./commands";
import { renderRecordingBar } from "./recording-bar";
import type { SessionState } from "./session";
import { mountTextPane } from "./text-pane";

const title = document.querySelector<HTMLInputElement>("#title")!;
const pane = mountTextPane(document.querySelector<HTMLElement>("#script")!, { edit, undo, redo });

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

let savedTitle = "";

function render(state: SessionState) {
  savedTitle = state.title;
  document.title = state.title;
  title.value = state.title;
  pane.render(state.words);
  renderRecordingBar(state.recordingBar);
}

onSessionState(render);
