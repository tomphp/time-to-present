import type { RecordingTarget } from "./recording-target";
import type { ClockState, MenuCommand, PerformanceLayout, SessionState, WindowReport } from "./session";

/** What the menu bar's Script, Perform and File items depend on in the Editor. */
export interface EditorMenuState {
  session: SessionState | null;
  clock: ClockState | null;
  target: RecordingTarget;
  selected: string[];
  listenable: boolean;
  inspectorShown: boolean;
}

/** The parts of the Editor whose buttons and keys the menu commands share. */
export interface EditorParts {
  recordingBar: { toggle(): void; reRecord(): void };
  pane: { addEventAtCaret(): void };
  inspector: { retime(): void; toggle(): void };
  preview: { listen(): void; playFromCursor(): void };
  clock: { playPause(): void; restart(): void };
  performMenu: { chooseLayout(layout: PerformanceLayout): void };
  removeUnusedRecordings(): void;
}

const commandsOf = (parts: EditorParts): Partial<Record<MenuCommand, () => void>> => ({
  removeUnusedRecordings: () => parts.removeUnusedRecordings(),
  record: () => parts.recordingBar.toggle(),
  reRecordSelection: () => parts.recordingBar.reRecord(),
  addNamedEvent: () => parts.pane.addEventAtCaret(),
  retime: () => parts.inspector.retime(),
  toggleInspector: () => parts.inspector.toggle(),
  listen: () => parts.preview.listen(),
  layoutTwoWindows: () => parts.performMenu.chooseLayout("twoWindows"),
  layoutCombined: () => parts.performMenu.chooseLayout("combined"),
  layoutTeleprompterOnly: () => parts.performMenu.chooseLayout("teleprompterOnly"),
  playPause: () => parts.clock.playPause(),
  playFromCursor: () => parts.preview.playFromCursor(),
  restart: () => parts.clock.restart(),
});

/** The timeline cannot be hidden yet. */
const editorReport = ({ session, clock, target, selected, listenable, inspectorShown }: EditorMenuState): WindowReport => ({
  window: "editor",
  recording: session?.recordingBar?.recording ?? false,
  selection: "reRecord" in target,
  retimable: selected.length > 0,
  listenable,
  locked: session?.locked ?? false,
  clock,
  inspectorShown,
  timelineShown: true,
});

/** Tells the menu bar what the Editor offers whenever that changes, and runs the commands it hands back. */
export function editorMenu(
  parts: EditorParts,
  state: () => EditorMenuState,
  report: (report: WindowReport) => Promise<void>,
) {
  const commands = commandsOf(parts);
  let reported = "";
  return {
    run: (command: MenuCommand) => commands[command]?.(),
    changed() {
      const next = editorReport(state());
      const key = JSON.stringify(next);
      if (key === reported) return;
      reported = key;
      report(next).catch((reason) => {
        reported = "";
        console.error(reason);
      });
    },
  };
}
