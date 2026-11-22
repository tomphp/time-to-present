import { open } from "@tauri-apps/plugin-dialog";
import { newPresentation, onMenuCommand, openFolder, recentPresentations } from "./commands";
import { mountStart } from "./start-view";

async function pickFolder(title: string) {
  const folder = await open({ directory: true, title });
  return typeof folder === "string" ? folder : null;
}

async function checkMicrophone() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

const start = mountStart({ pickFolder, newPresentation, openFolder, recentPresentations, checkMicrophone });

onMenuCommand((command) => {
  if (command === "newPresentation") start.newPresentation();
});
