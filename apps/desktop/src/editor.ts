import { onSessionState } from "./commands";
import { scriptLayout } from "./script-view";
import type { SessionState } from "./session";

const title = document.querySelector<HTMLHeadingElement>("#title")!;
const script = document.querySelector<HTMLElement>("#script")!;

function render(state: SessionState) {
  document.title = state.title;
  title.textContent = state.title;
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
