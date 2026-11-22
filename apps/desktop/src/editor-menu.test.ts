import { describe, expect, it, vi } from "vitest";
import { editorMenu, type EditorMenuState } from "./editor-menu";
import type { SessionState, WindowReport } from "./session";
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
  listenable: false,
};

const recordingBar = (recording: boolean): SessionState["recordingBar"] => ({
  access: "granted",
  inputs: [],
  input: null,
  notice: null,
  recording,
  liveModel: { kind: "ready" },
});

function reporting(state: EditorMenuState) {
  const reports: WindowReport[] = [];
  let current = state;
  const menu = editorMenu({}, () => current, async (report) => void reports.push(report));
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
    change({ target: { reRecord: ["w1"] }, listenable: true });

    expect(reports.at(-1)).toMatchObject({ selection: true, listenable: true });
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

  it("reports no clock while the Editor has none", () => {
    const { reports, change } = reporting(idle);
    change({ clock: null, session: null });

    expect(reports.at(-1)).toMatchObject({ clock: null, recording: false, locked: false });
  });
});

describe("a menu command reaching the Editor", () => {
  it("runs the Editor's own command for it", () => {
    const record = vi.fn();
    const restart = vi.fn();
    const menu = editorMenu({ record, restart }, () => idle, async () => {});

    menu.run("record");

    expect(record).toHaveBeenCalledOnce();
    expect(restart).not.toHaveBeenCalled();
  });

  it("ignores a command the Editor does not run", () => {
    const menu = editorMenu({}, () => idle, async () => {});

    expect(() => menu.run("mirror")).not.toThrow();
  });
});
