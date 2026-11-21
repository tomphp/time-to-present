import { onSessionState, renamePresentation } from "./commands";
import { scriptLayout } from "./script-view";
import type { SessionState } from "./session";

const title = document.querySelector<HTMLInputElement>("#title")!;
const script = document.querySelector<HTMLElement>("#script")!;

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
  script.replaceChildren(...paragraphs(state));
}

function paragraphs(state: SessionState): HTMLElement[] {
  const layout = scriptLayout(state.words);
  if (layout.length === 0) return [element("p", "This Script has no Words yet.", "empty")];
  return layout.map((lines) => {
    const paragraph = element("p");
    lines.forEach((line, index) => {
      if (index > 0) paragraph.append(document.createElement("br"));
      line.forEach(({ id, text }, position) => {
        if (position > 0) paragraph.append(" ");
        const word = element("span", text);
        word.dataset.wordId = id;
        paragraph.append(word);
      });
    });
    return paragraph;
  });
}

function element(tag: string, text = "", className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

onSessionState(render);
