import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ApproachCueSettings } from "./approach-cue";
import type { Clip } from "./audio-schedule";
import type { RecordingTarget } from "./recording-target";
import type {
  Display,
  Edit,
  ForwardedKey,
  InputChoice,
  InsertionPoint,
  Meter,
  PerformanceSettings,
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

const startRecording = (at: InsertionPoint) => invoke<void>("start_recording", { at });
const startReRecording = (words: string[]) => invoke<void>("start_re_recording", { words });
export const startRecordingAt = (target: RecordingTarget) =>
  "reRecord" in target ? startReRecording(target.reRecord) : startRecording(target.insertAt);

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
export const startPerformance = () => invoke<void>("perform");
export const displays = () => invoke<Display[]>("displays");
export const performanceSettings = () => invoke<PerformanceSettings>("performance_settings");
export const setPerformanceSettings = (performance: PerformanceSettings) =>
  invoke<void>("set_performance_settings", { performance });
export const forwardKey = (key: ForwardedKey) => invoke<void>("forward_key", { key });
export const leaveFullscreen = () => invoke<void>("leave_fullscreen");
export const toggleFullscreen = () => invoke<void>("toggle_fullscreen");

export function onPerformanceSettings(handle: (settings: PerformanceSettings) => void) {
  void listen<PerformanceSettings>("performance-settings", (event) => handle(event.payload));
  void performanceSettings().then(handle);
}

export function onPerformanceKey(handle: (key: ForwardedKey) => void) {
  void listen<ForwardedKey>("performance-key", (event) => handle(event.payload));
}

export function onAppFocus(handle: (focused: boolean) => void) {
  void listen<boolean>("app-focus", (event) => handle(event.payload));
}

export function onFullscreenChanged(handle: (fullscreen: boolean) => void) {
  void listen<boolean>("fullscreen-changed", (event) => handle(event.payload));
}

export const setApproachCue = (cue: ApproachCueSettings) => invoke<void>("set_approach_cue", { cue });

export function onApproachCue(render: (cue: ApproachCueSettings) => void) {
  void listen<ApproachCueSettings>("approach-cue", (event) => render(event.payload));
  void invoke<ApproachCueSettings>("approach_cue").then(render);
}

export const onStreamEvent = (render: (event: StreamEvent) => void) =>
  connectStream({ listen: (onEvent) => listen<StreamEvent>("session-event", (event) => onEvent(event.payload)), snapshot }, render);

export const openInBrowser = () => invoke<void>("open_in_browser");
