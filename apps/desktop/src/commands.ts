import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SessionState } from "./session";

export const newPresentation = (parent: string, title: string) =>
  invoke<SessionState>("new_presentation", { parent, title });

export const openFolder = (folder: string) => invoke<SessionState>("open_folder", { folder });

export function onSessionState(render: (state: SessionState) => void) {
  void listen<SessionState>("session-state", (event) => render(event.payload));
  void invoke<SessionState | null>("session_state").then((state) => state && render(state));
}
