// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Clip } from "./audio-schedule";
import { mountPreview } from "./preview-controls";
import type { InsertionPoint, SessionState } from "./session";
import { scriptWord } from "./test-words";

const settle = () => new Promise((resolve) => setTimeout(resolve));

const words = [
  scriptWord("w1", "Hello", { start: 0, recordingId: "r1", audioStart: 0, audioEnd: 300 }),
  scriptWord("w2", "world", { start: 400, recordingId: "r1", audioStart: 400, audioEnd: 700 }),
];

const session = (locked = false) => ({ words, scriptEnd: 700, locked, previewing: false }) as SessionState;

let previews: (number | null)[];
let clips: Clip[];
let selected: string[];
let caret: InsertionPoint;

class SilentAudio {
  currentTime = 0;
  destination = {};
  resume = async () => {};
  decodeAudioData = async () => ({});
  createGain = () => ({ gain: {}, connect() {} });
  createBufferSource = () => ({ connect() {}, start() {}, stop() {} });
}

beforeEach(() => {
  document.body.innerHTML = `
    <p id="error" hidden></p>
    <button id="play-from-cursor"></button><button id="listen"></button>`;
  Object.assign(globalThis, { AudioContext: SilentAudio });
  previews = [];
  clips = [];
  selected = [];
  caret = { before: "w2" };
});

function mount() {
  const controls = mountPreview(
    { selected: () => selected, insertionPoint: () => caret, highlight() {}, playhead() {} },
    {
      preview: async (from) => void previews.push(from),
      recordingClip: async (clip) => {
        clips.push(clip);
        return new ArrayBuffer(0);
      },
    },
  );
  controls.render(session());
  return controls;
}

const click = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!.click();

describe("Play from Cursor from the menu", () => {
  it("plays from the cursor, as its button does", async () => {
    const controls = mount();
    controls.playFromCursor();
    click("#play-from-cursor");
    await settle();

    expect(previews).toEqual([400, 400]);
  });

  it("plays from the selection when there is one", async () => {
    const controls = mount();
    selected = ["w1"];
    controls.playFromCursor();
    await settle();

    expect(previews).toEqual([0]);
  });

  it("does nothing under the Edit lock", async () => {
    const controls = mount();
    controls.render(session(true));
    controls.playFromCursor();
    await settle();

    expect(previews).toEqual([]);
  });
});

describe("Listen from the menu", () => {
  it("plays the selected Word, as its button does", async () => {
    const controls = mount();
    selected = ["w2"];
    controls.selectionChanged();
    controls.listen();
    click("#listen");
    await settle();

    expect(clips).toHaveLength(2);
    expect(clips[0]).toEqual(clips[1]);
    expect(clips[0]).toMatchObject({ recording: "r1" });
  });

  it("reports whether there is a Word to listen to", () => {
    const controls = mount();
    expect(controls.listenable()).toBe(false);
    selected = ["w1"];
    expect(controls.listenable()).toBe(true);
  });
});

describe("the transport's buttons", () => {
  const button = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!;

  it("names Play from Cursor by where it starts", () => {
    mount();

    expect(button("#play-from-cursor").getAttribute("aria-label")).toBe("Play from the cursor");
    expect(button("#play-from-cursor").dataset.tooltip).toBe("Play from the cursor");
    expect(button("#play-from-cursor").textContent).toBe("");
  });

  it("names Listen by what it plays", () => {
    mount();

    expect(button("#listen").dataset.tooltip).toBe("Listen to the selected Word");
    expect(button("#listen").textContent).toBe("");
  });

  it("disables Play from Cursor under the Edit lock", () => {
    const controls = mount();
    expect(button("#play-from-cursor").disabled).toBe(false);

    controls.render(session(true));
    expect(button("#play-from-cursor").disabled).toBe(true);
  });

  it("disables Listen until a recorded Word is selected", () => {
    const controls = mount();
    expect(button("#listen").disabled).toBe(true);

    selected = ["w1"];
    controls.selectionChanged();
    expect(button("#listen").disabled).toBe(false);
  });
});
