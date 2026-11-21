import { open } from "@tauri-apps/plugin-dialog";
import { newPresentation, openFolder, openSettings, recentPresentations } from "./commands";

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

const notice = document.querySelector<HTMLParagraphElement>("#notice")!;
const recent = document.querySelector<HTMLElement>("#recent")!;
const recentList = document.querySelector<HTMLUListElement>("#recent-list")!;

function folderName(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
}

async function showRecent() {
  const { folders, dropped } = await recentPresentations();
  recent.hidden = folders.length === 0;
  recentList.replaceChildren(
    ...folders.map((folder) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = folderName(folder);
      button.title = folder;
      button.addEventListener("click", () =>
        openFolder(folder).catch((reason) => {
          showError(reason);
          async function checkMicrophone() {
  error.hidden = true;
  notice.hidden = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    notice.textContent = "Microphone access granted";
    notice.hidden = false;
  } catch (reason) {
    showError(`Microphone access failed: ${reason}`);
  }
}

document.querySelector("#open-settings")!.addEventListener("click", () => void openSettings());
document.querySelector("#check-microphone")!.addEventListener("click", checkMicrophone);

void showRecent();
        }),
      );
      const item = document.createElement("li");
      item.append(button);
      return item;
    }),
  );
  notice.hidden = dropped.length === 0;
  notice.textContent = `Removed from Recent, no longer found: ${dropped.map(folderName).join(", ")}`;
}

async function checkMicrophone() {
  error.hidden = true;
  notice.hidden = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    notice.textContent = "Microphone access granted";
    notice.hidden = false;
  } catch (reason) {
    showError(`Microphone access failed: ${reason}`);
  }
}

document.querySelector("#open-settings")!.addEventListener("click", () => void openSettings());
document.querySelector("#check-microphone")!.addEventListener("click", checkMicrophone);

void showRecent();
