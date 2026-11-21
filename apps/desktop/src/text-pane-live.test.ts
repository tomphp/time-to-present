// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveTranscript, PendingPassage, SessionState } from "./session";
import { mountTextPane } from "./text-pane";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,"), scriptWord("w2", "world.")];

const live = (heard: string[], failure: string | null = null): LiveTranscript => ({
  after: "w1",
  before: "w2",
  words: heard,
  failure,
});

const state = (liveTranscript: LiveTranscript | null, pendingPassages: PendingPassage[] = [], reRecording: string[] = []) =>
  ({
    words,
    namedEvents: [],
    movedEvents: [],
    pendingPassages,
    liveTranscript,
    locked: liveTranscript !== null,
    reRecording,
  }) as unknown as SessionState;

let root: HTMLElement;
let scrolled: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = '<article id="script"></article>';
  root = document.querySelector<HTMLElement>("#script")!;
  scrolled = vi.fn();
  Element.prototype.scrollIntoView = scrolled as unknown as Element["scrollIntoView"];
});

function mountPane() {
  const commands = { edit: vi.fn(), cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), undo: vi.fn(), redo: vi.fn() };
  return mountTextPane(root, commands, { insertEventAt: vi.fn(), selectEvent: vi.fn() }, vi.fn());
}

const transcript = () => root.querySelector<HTMLElement>(".live-transcript");
const textOf = (element: Element | null) => element?.textContent?.replace(/\s+/g, " ").trim();

describe("the text pane while recording", () => {
  it("shows the Live Transcript as provisional text at the Insertion Point, outside the Script's Words", () => {
    const pane = mountPane();

    pane.render(state(live(["The", "quick"])));

    expect(textOf(root)).toBe("Hello, The quick world.");
    expect(transcript()!.textContent).toBe("The quick");
    expect(transcript()!.contentEditable).toBe("false");
    expect(transcript()!.querySelector("[data-word-id]")).toBeNull();
  });

  it("revises the Live Transcript in place and keeps it in view", () => {
    const pane = mountPane();
    pane.render(state(live(["The", "quick"])));
    const shown = transcript();
    scrolled.mockClear();

    pane.render(state(live(["The", "quack", "brown"])));

    expect(transcript()).toBe(shown);
    expect(transcript()!.textContent).toBe("The quack brown");
    expect(scrolled).toHaveBeenCalled();
  });

  it("shows why the Live Transcript stopped", () => {
    const pane = mountPane();

    pane.render(state(live(["The"], "the live model would not load")));

    expect(textOf(transcript())).toBe("The — the live model would not load");
  });

  it("shows the Live Transcript of a Re-record after the Words it is struck through over", () => {
    const pane = mountPane();

    pane.render(state({ after: null, before: "w2", words: ["Howdy,"], failure: null }, [], ["w1"]));

    expect(textOf(root)).toBe("Hello, Howdy, world.");
    expect(root.querySelector(".re-recorded")!.textContent).toBe("Hello,");
    expect(root.querySelector(".re-recorded")!.nextElementSibling).toBe(transcript());
  });

  it("sits after the passages already pending at the same spot", () => {
    const pane = mountPane();
    const pending: PendingPassage = { recordingId: "r1", after: "w1", before: "w2", replacing: [], status: { kind: "queued" } };

    pane.render(state(live(["Later"]), [pending]));

    const pendingThenLive = [...root.querySelectorAll(".pending-passage, .live-transcript")].map((element) => element.className);
    expect(pendingThenLive).toEqual(["pending-passage", "live-transcript"]);
  });

  it("is read-only during capture and editable again once it ends", () => {
    const pane = mountPane();
    pane.render(state(null));
    expect(root.contentEditable).toBe("true");

    pane.render(state(live([])));
    expect(root.contentEditable).toBe("false");

    pane.render(state(null));
    expect(root.contentEditable).toBe("true");
    expect(transcript()).toBeNull();
  });
});
