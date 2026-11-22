import type { RecordingTarget } from "./recording-target";
import type { ClockState, MenuCommand, SessionState, WindowReport } from "./session";

/** What the menu bar's Script, Perform and File items depend on in the Editor. */
export interface EditorMenuState {
  session: SessionState | null;
  clock: ClockState | null;
  target: RecordingTarget;
  listenable: boolean;
}

/** The function each menu command runs: the one its button or key runs. */
export type EditorCommands = Partial<Record<MenuCommand, () => void>>;

/** The Inspector and timeline cannot be hidden yet. */
const editorReport = ({ session, clock, target, listenable }: EditorMenuState): WindowReport => ({
  window: "editor",
  recording: session?.recordingBar?.recording ?? false,
  selection: "reRecord" in target,
  listenable,
  locked: session?.locked ?? false,
  clock,
  inspectorShown: true,
  timelineShown: true,
});

/** Tells the menu bar what the Editor offers whenever that changes, and runs the commands it hands back. */
export function editorMenu(
  commands: EditorCommands,
  state: () => EditorMenuState,
  report: (report: WindowReport) => Promise<void>,
) {
  let reported = "";
  return {
    run: (command: MenuCommand) => commands[command]?.(),
    changed() {
      const next = editorReport(state());
      const key = JSON.stringify(next);
      if (key === reported) return;
      reported = key;
      report(next).catch(console.error);
    },
  };
}
