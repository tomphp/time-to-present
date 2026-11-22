import { describe, expect, it, vi } from "vitest";
import { editorMenu, type EditorMenuState, type EditorParts } from "./editor-menu";
import type { MenuCommand, SessionState, WindowReport } from "./session";
import { scriptWord } from "./test-words";

const session = (changes: Partial<SessionState> = {}): SessionState => ({
  folder: "/talk",
  title: "Talk",
  presentationSize: "fillDisplay",
  words: [scriptWord("w1", "Hello")],
  namedEvents: [],
  movedEvents: [],
  scriptEnd: 300,
  recordingBar: null,
  reRecording: [],
  pendingPassages: [],
  locked: false,
  liveTranscript: null,
  previewing: false,
  ...changes,
});

const idle: EditorMenuState = {
  session: session(),
  clock: "ready",
  target: { insertAt: { before: null } },
  selected: [],
  listenable: false,
  inspectorShown: true,
};

const recordingBar = (recording: boolean): SessionState["recordingBar"] => ({
  access: "granted",
  inputs: [],
  input: null,
  notice: null,
  recording,
  liveModel: { kind: "ready" },
});

function editorParts(ran: string[]): EditorParts {
  const runs = (name: string) => () => void ran.push(name);
  return {
    recordingBar: { toggle: runs("recording toggle"), reRecord: runs("recording start unless recording") },
    pane: { addEventAtCaret: runs("event at caret") },
    inspector: { retime: runs("Retime field"), toggle: runs("Inspector card button") },
    preview: { listen: runs("listen"), playFromCursor: runs("play from cursor") },
    clock: { playPause: runs("play/pause button"), restart: runs("restart button") },
    performMenu: { chooseLayout: (layout) => void ran.push(`layout ${layout}`) },
    removeUnusedRecordings: runs("remove unused recordings"),
  };
}

function reporting(state: EditorMenuState, send = async (_: WindowReport) => {}) {
  const reports: WindowReport[] = [];
  let current = state;
  const menu = editorMenu(editorParts([]), () => current, (report) => {
    reports.push(report);
    return send(report);
  });
  return {
    reports,
    change(next: Partial<EditorMenuState>) {
      current = { ...current, ...next };
      menu.changed();
    },
  };
}

describe("the Editor's report to the menu bar", () => {
  it("tells the menu what an idle Editor offers", () => {
    const { reports, change } = reporting(idle);
    change({});

    expect(reports).toEqual([
      {
        window: "editor",
        recording: false,
        selection: false,
        retimable: false,
        listenable: false,
        locked: false,
        clock: "ready",
        inspectorShown: true,
        timelineShown: true,
      },
    ]);
  });

  it("reports a Recording under way and the Edit lock it brings", () => {
    const { reports, change } = reporting(idle);
    change({ session: session({ recordingBar: recordingBar(true), locked: true }) });

    expect(reports.at(-1)).toMatchObject({ recording: true, locked: true });
  });

  it("reports a selection when a Recording would Re-record it", () => {
    const { reports, change } = reporting(idle);
    change({ target: { reRecord: ["w1"] }, selected: ["w1"], listenable: true });

    expect(reports.at(-1)).toMatchObject({ selection: true, retimable: true, listenable: true });
  });

  it("reports Words to retime when the caret is in one, though a Recording would insert there", () => {
    const { reports, change } = reporting(idle);
    change({ selected: ["w1"] });

    expect(reports.at(-1)).toMatchObject({ selection: false, retimable: true });
  });

  it("reports the clock as it plays and ends", () => {
    const { reports, change } = reporting(idle);
    change({ clock: "playing" });
    change({ clock: "ended" });

    expect(reports.map((report) => "clock" in report && report.clock)).toEqual(["playing", "ended"]);
  });

  it("reports nothing again until something the menu shows has changed", () => {
    const { reports, change } = reporting(idle);
    change({});
    change({ session: session({ title: "Renamed" }) });
    change({ target: { insertAt: { before: "w1" } } });

    expect(reports).toHaveLength(1);
  });

  it("reports again after a report the shell did not take", async () => {
    const { reports, change } = reporting(idle, async () => Promise.reject("no shell"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    change({});
    await new Promise((resolve) => setTimeout(resolve));
    change({});

    expect(reports).toHaveLength(2);
  });

  it("reports a hidden Inspector", () => {
    const { reports, change } = reporting(idle);
    change({ inspectorShown: false });

    expect(reports.at(-1)).toMatchObject({ inspectorShown: false });
  });

  it("reports no clock while the Editor has none", () => {
    const { reports, change } = reporting(idle);
    change({ clock: null, session: null });

    expect(reports.at(-1)).toMatchObject({ clock: null, recording: false, locked: false });
  });
});

describe("a menu command reaching the Editor", () => {
  const run = (command: MenuCommand) => {
    const ran: string[] = [];
    editorMenu(editorParts(ran), () => idle, async () => {}).run(command);
    return ran;
  };

  it("runs what the Editor's own button or key runs", () => {
    expect(run("record")).toEqual(["recording toggle"]);
    expect(run("reRecordSelection")).toEqual(["recording start unless recording"]);
    expect(run("addNamedEvent")).toEqual(["event at caret"]);
    expect(run("retime")).toEqual(["Retime field"]);
    expect(run("listen")).toEqual(["listen"]);
    expect(run("playPause")).toEqual(["play/pause button"]);
    expect(run("playFromCursor")).toEqual(["play from cursor"]);
    expect(run("restart")).toEqual(["restart button"]);
    expect(run("removeUnusedRecordings")).toEqual(["remove unused recordings"]);
    expect(run("toggleInspector")).toEqual(["Inspector card button"]);
  });

  it("chooses the Performance Layout it names", () => {
    expect(run("layoutTwoWindows")).toEqual(["layout twoWindows"]);
    expect(run("layoutCombined")).toEqual(["layout combined"]);
    expect(run("layoutTeleprompterOnly")).toEqual(["layout teleprompterOnly"]);
  });

  it("ignores a command the Editor does not run", () => {
    expect(run("mirror")).toEqual([]);
  });
});
