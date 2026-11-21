// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scriptWord } from "./test-words";
import { mountTimeline } from "./timeline";

const words = [scriptWord("w1", "Hello,", { duration: 500 }), scriptWord("w2", "world.", { start: 600, duration: 500 })];

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<section id="timeline"></section>';
  root = document.querySelector<HTMLElement>("#timeline")!;
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

function mount(locked: boolean) {
  const commands = { drag: vi.fn(async () => ({}) as never), waveform: vi.fn(async () => ({ bucket: 10, peaks: [] })) };
  const pick = vi.fn();
  const pickEvent = vi.fn();
  const timeline = mountTimeline(root, commands, pick, pickEvent);
  timeline.render(words, [], [], 1_100, [], locked);
  return { commands, pick, lock: () => timeline.render(words, [], [], 1_100, [], true) };
}

const pointer = (type: string, clientX: number) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });

function dragFirstWord() {
  const track = root.querySelector<HTMLElement>(".track")!;
  track.dispatchEvent(pointer("pointerdown", 50));
  track.dispatchEvent(pointer("pointermove", 90));
}

describe("the edit lock on the timeline", () => {
  it("picks but never drags while locked", () => {
    const { commands, pick } = mount(true);

    dragFirstWord();

    expect(pick).toHaveBeenCalledWith("w1", false);
    expect(commands.drag).not.toHaveBeenCalled();
    expect(root.classList.contains("locked")).toBe(true);
  });

  it("stops a drag in flight when the lock arrives", () => {
    const { commands, lock } = mount(false);
    const track = root.querySelector<HTMLElement>(".track")!;
    track.dispatchEvent(pointer("pointerdown", 50));

    lock();
    track.dispatchEvent(pointer("pointermove", 90));

    expect(commands.drag).not.toHaveBeenCalled();
  });

  it("drags when unlocked", () => {
    const { commands } = mount(false);

    dragFirstWord();

    expect(commands.drag).toHaveBeenCalledWith(expect.any(String), { kind: "move", word: "w1", by: 200 });
    expect(root.classList.contains("locked")).toBe(false);
  });
});
