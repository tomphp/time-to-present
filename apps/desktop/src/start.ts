import { open } from "@tauri-apps/plugin-dialog";
import { newPresentation, openFolder } from "./commands";

const form = document.querySelector<HTMLFormElement>("#new-presentation")!;
const error = document.querySelector<HTMLParagraphElement>("#error")!;

function showError(reason: unknown) {
  error.textContent = String(reason);
  error.hidden = false;
}

async function pickFolder(title: string) {
  const folder = await open({ directory: true, title });
  return typeof folder === "string" ? folder : null;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = String(new FormData(form).get("title") ?? "");
  const parent = await pickFolder("Choose where to make the Presentation folder");
  if (parent) await newPresentation(parent, title).catch(showError);
});

document.querySelector("#open-folder")!.addEventListener("click", async () => {
  const folder = await pickFolder("Open a Presentation folder");
  if (folder) await openFolder(folder).catch(showError);
});
