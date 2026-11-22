import { installedModels, onModelProgress, removeModel } from "./commands";
import { describeProgress, formatBytes } from "./model-view";

const list = document.querySelector<HTMLUListElement>("#models")!;
const empty = document.querySelector<HTMLParagraphElement>("#no-models")!;
const progress = document.querySelector<HTMLParagraphElement>("#progress")!;
const error = document.querySelector<HTMLParagraphElement>("#error")!;

function showError(reason: unknown) {
  error.textContent = String(reason);
  error.hidden = false;
}

async function showModels() {
  const models = await installedModels();
  empty.hidden = models.length > 0;
  list.replaceChildren(
    ...models.map(({ name, bytes }) => {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn";
      remove.textContent = "Remove";
      remove.addEventListener("click", () =>
        removeModel(name).then(showModels, showError),
      );
      const item = document.createElement("li");
      item.append(`${name} · ${formatBytes(bytes)} `, remove);
      return item;
    }),
  );
}

onModelProgress((update) => {
  progress.textContent = describeProgress(update);
  progress.hidden = false;
  if (update.total !== null && update.downloaded >= update.total) {
    progress.hidden = true;
    void showModels();
  }
});

showModels().catch(showError);
