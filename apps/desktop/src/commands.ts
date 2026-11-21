import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SessionState } from "./session";

export const newPresentation = (parent: string, title: string) =>
  invoke<SessionState>("new_presentation", { parent, title });

export const openFolder = (folder: string) => invoke<SessionState>("open_folder", { folder });

export interface Recent {
  folders: string[];
  dropped: string[];
}

export const recentPresentations = () => invoke<Recent>("recent_presentations");

export const renamePresentation = (title: string) => invoke<void>("rename_presentation", { title });

export function onSessionState(render: (state: SessionState) => void) {
  void listen<SessionState>("session-state", (event) => render(event.payload));
  void invoke<SessionState | null>("session_state").then((state) => state && render(state));
}

export interface InstalledModel {
  name: string;
  bytes: number;
}

export interface ModelProgress {
  name: string;
  downloaded: number;
  total: number | null;
}

export const installedModels = () => invoke<InstalledModel[]>("installed_models");

export const removeModel = (name: string) => invoke<void>("remove_model", { name });

export const ensureModel = (name: string) => invoke<void>("ensure_model", { name });

export const openSettings = () => invoke<void>("open_settings");

export function onModelProgress(render: (progress: ModelProgress) => void) {
  void listen<ModelProgress>("model-progress", (event) => render(event.payload));
}
