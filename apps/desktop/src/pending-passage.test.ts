// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentCaret } from "./dom-caret";
import { describePending, onPendingAction, samePending, samePlacement } from "./pending-passage";
import { renderScript } from "./pane-render";
import type { PendingPassage } from "./session";
import { scriptWord } from "./test-words";

const words = [scriptWord("w1", "Hello,"), scriptWord("w2", "world."), scriptWord("w3", "Typed")];

const passage = (
  recordingId: string,
  after: string | null,
  before: string | null,
  status: PendingPassage["status"],
  replacing: string[] = [],
): PendingPassage => ({ recordingId, after, before, replacing, status });

describe("describePending", () => {
  it("names each stage of a Transcription", () => {
    expect(describePending({ kind: "queued" })).toBe("Waiting to transcribe…");
    expect(describePending({ kind: "fetchingModel", percent: null })).toBe("Fetching the speech model…");
    expect(describePending({ kind: "fetchingModel", percent: 42 })).toBe("Fetching the speech model… 42%");
    expect(describePending({ kind: "transcribing", percent: 70 })).toBe("Transcribing… 70%");
    expect(describePending({ kind: "failed", reason: "No speech found" })).toBe("No speech found");
  });
});

describe("samePending", () => {
  const queued = passage("r1", "w3", null, { kind: "queued" });

  it("holds when every passage is unchanged, in order", () => {
    expect(samePending([queued], [{ ...queued }])).toBe(true);
    expect(samePending([], [])).toBe(true);
  });

  it("breaks when one is added, dropped, moved or progresses", () => {
    expect(samePending([], [queued])).toBe(false);
    expect(samePending([queued], [])).toBe(false);
    expect(samePending([queued], [{ ...queued, before: "w2" }])).toBe(false);
    expect(samePending([queued], [{ ...queued, status: { kind: "transcribing", percent: 10 } }])).toBe(false);
  });
});

describe("samePlacement", () => {
  const queued = passage("r1", "w3", null, { kind: "queued" });

  it("holds while the same passages sit at the same anchors, whatever their progress", () => {
    expect(samePlacement([queued], [{ ...queued, status: { kind: "transcribing", percent: 10 } }])).toBe(true);
  });

  it("breaks when one is added, dropped, reordered or re-anchored", () => {
    const other = passage("r2", "w3", null, { kind: "queued" });
    expect(samePlacement([queued], [queued, other])).toBe(false);
    expect(samePlacement([queued, other], [other, queued])).toBe(false);
    expect(samePlacement([queued], [{ ...queued, after: "w2" }])).toBe(false);
    expect(samePlacement([queued], [{ ...queued, replacing: ["w3"] }])).toBe(false);
  });
});

describe("rendering Pending Passages", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<article id="script"></article>';
    root = document.querySelector<HTMLElement>("#script")!;
  });

  const struck = () => Array.from(root.querySelectorAll<HTMLElement>(".re-recorded")).map((word) => word.dataset.wordId);

  const sequence = () =>
    Array.from(root.querySelector("p")!.childNodes).map((node) =>
      node instanceof HTMLElement ? (node.dataset.wordId ?? node.dataset.recordingId) : node.textContent,
    );

  it("shows a locked placeholder with its progress before its next Word", () => {
    renderScript(root, words, null, undefined, { pending: [passage("r2", "w1", "w2", { kind: "transcribing", percent: 40 })] });

    expect(sequence()).toEqual(["w1", " ", "r2", " ", "w2", " ", "w3"]);
    const placeholder = root.querySelector<HTMLElement>('[data-recording-id="r2"]')!;
    expect(placeholder.textContent).toBe("Transcribing… 40%");
    expect(placeholder.contentEditable).toBe("false");
  });

  it("falls back to after its previous Word, then to the end, as neighbours go", () => {
    renderScript(root, words, null, undefined, {
      pending: [passage("r2", "w1", "gone", { kind: "queued" }), passage("r3", "gone", "gone", { kind: "queued" })],
    });

    expect(sequence()).toEqual(["w1", " ", "r2", " ", "w2", " ", "w3", " ", "r3"]);
  });

  it("offers Retry and Discard on a failed one", () => {
    renderScript(root, words, null, undefined, { pending: [passage("r2", "w3", null, { kind: "failed", reason: "No speech found" })] });

    const placeholder = root.querySelector<HTMLElement>('[data-recording-id="r2"]')!;
    expect(placeholder.className).toBe("pending-passage failed");
    expect(placeholder.querySelector("[data-retry]")!.textContent).toBe("Retry");
    expect(placeholder.querySelector("[data-discard]")!.textContent).toBe("Discard");
    expect(placeholder.textContent).toContain("No speech found");
  });

  it("offers Transcribe and Discard on an interrupted one", () => {
    renderScript(root, words, null, undefined, [passage("r2", "w3", null, { kind: "interrupted" })]);

    const placeholder = root.querySelector<HTMLElement>('[data-recording-id="r2"]')!;
    expect(placeholder.querySelector("[data-retry]")!.textContent).toBe("Transcribe");
    expect(placeholder.querySelector("[data-discard]")!.textContent).toBe("Discard");
  });

  it("strikes through the Words a pending Re-record replaces, showing its progress after them", () => {
    renderScript(root, words, null, undefined, { pending: [passage("r2", null, "w3", { kind: "queued" }, ["w1", "w2"])] });

    expect(sequence()).toEqual(["w1", " ", "w2", " ", "r2", " ", "w3"]);
    expect(struck()).toEqual(["w1", "w2"]);
  });

  it("strikes through the Words being Re-recorded while capturing", () => {
    renderScript(root, words, null, undefined, { reRecording: ["w2"] });

    expect(struck()).toEqual(["w2"]);
  });

  it("stands alone in an empty Script", () => {
    renderScript(root, [], null, undefined, { pending: [passage("r1", null, null, { kind: "queued" })] });

    expect(sequence()).toEqual(["r1"]);
  });

  it("runs Retry and Discard from the buttons on a failed one", () => {
    renderScript(root, words, null, undefined, { pending: [passage("r2", "w3", null, { kind: "failed", reason: "No speech found" })] });
    const actions = { retry: vi.fn(), discard: vi.fn() };
    onPendingAction(root, actions);

    root.querySelector<HTMLElement>("[data-retry]")!.click();
    root.querySelector<HTMLElement>("[data-discard]")!.click();
    root.querySelector<HTMLElement>('[data-word-id="w1"]')!.click();

    expect(actions.retry).toHaveBeenCalledWith("r2");
    expect(actions.discard).toHaveBeenCalledWith("r2");
    expect(actions.retry).toHaveBeenCalledTimes(1);
  });

  it("reads a caret inside it as the start of the Word after it", () => {
    renderScript(root, words, null, undefined, { pending: [passage("r2", "w1", "w2", { kind: "queued" })] });
    const text = root.querySelector('[data-recording-id="r2"]')!.firstChild!;

    document.getSelection()!.setBaseAndExtent(text, 3, text, 3);

    expect(currentCaret(root)).toEqual({ word: "w2", offset: 0 });
  });
});
