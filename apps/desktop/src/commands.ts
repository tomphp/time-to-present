import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Clip } from "./audio-schedule";
import type {
  Edit,
  InputChoice,
  InsertionPoint,
  Meter,
  ServerStatus,
  SessionState,
  Snapshot,
  StreamEvent,
  Waveform,
} from "./session";
import { connectStream } from "./stream";

export const newPresentation = (parent: string, title: string) =>
  invoke<SessionState>("new_presentation", { parent, title });

export const openFolder = (folder: string) => invoke<SessionState>("open_folder", { folder });

export interface Recent {
  folders: string[];
  dropped: string[];
}

export const recentPresentations = () => invoke<Recent>("recent_presentations");

export const renamePresentation = (title: string) => invoke<void>("rename_presentation", { title });

export const edit = (edit: Edit) => invoke<SessionState>("edit", { edit });
export const cut = (words: string[]) => invoke<SessionState>("cut", { words });
export const copy = (words: string[]) => invoke<void>("copy", { words });
export const paste = (after: string | null, replacing: string[], text: string) =>
  invoke<SessionState>("paste", { after, replacing, text });
export const drag = (drag: string, edit: Edit) => invoke<SessionState>("drag", { drag, edit });
export const nudge = (run: string, edit: Edit) => invoke<SessionState>("nudge", { run, edit });
export const recordingClip = ({ recording, from, until }: Clip) =>
  invoke<ArrayBuffer>("recording_clip", { recording, from, until });
export const recordingWaveform = (recording: string) => invoke<Waveform>("recording_waveform", { recording });
export const undo = () => invoke<SessionState>("undo");
export const redo = () => invoke<SessionState>("redo");
export const selectEvent = (event: string) => invoke<SessionState>("select_event", { event });

export function onSessionState(render: (state: SessionState) => void) {
  void listen<SessionState>("session-state", (event) => render(event.payload));
  void invoke<SessionState | null>("session_state").then((state) => state && render(state));
}

export function onServerStatus(render: (status: ServerStatus) => void) {
  void listen<ServerStatus>("server-status", (event) => render(event.payload));
  void invoke<ServerStatus>("server_status").then(render);
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

export const openRecordingBar = () => invoke<void>("open_recording_bar");

export const selectInput = (choice: InputChoice) => invoke<void>("select_input", { choice });

export const selectChannel = (channel: number) => invoke<void>("select_channel", { channel });

export const closeRecordingBar = () => invoke<void>("close_recording_bar");

export const startRecording = (at: InsertionPoint) => invoke<void>("start_recording", { at });
export const startReRecording = (words: string[]) => invoke<void>("start_re_recording", { words });

export const stopRecording = () => invoke<void>("stop_recording");

export const cancelRecording = () => invoke<void>("cancel_recording");

export const retryTranscription = (recording: string) => invoke<void>("retry_transcription", { recording });

export const removeUnusedRecordings = () => invoke<void>("remove_unused_recordings");
export const discardTranscription = (recording: string) => invoke<void>("discard_transcription", { recording });

export function onMeter(render: (meter: Meter) => void) {
  void listen<Meter>("recording-meter", (event) => render(event.payload));
}

export const snapshot = () => invoke<Snapshot>("snapshot");
export const preview = (from: number | null) => invoke<void>("preview", { from });
export const play = () => invoke<void>("play");
export const pause = () => invoke<void>("pause");
export const seek = (scriptTime: number) => invoke<void>("seek", { scriptTime });
export const setSpeed = (speed: number) => invoke<void>("set_speed", { speed });
export const reset = () => invoke<void>("reset");
export const openTeleprompter = () => invoke<void>("open_teleprompter");

export const onStreamEvent = (render: (event: StreamEvent) => void) =>
  connectStream({ listen: (onEvent) => listen<StreamEvent>("session-event", (event) => onEvent(event.payload)), snapshot }, render);
