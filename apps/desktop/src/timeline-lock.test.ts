// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scriptWord } from "./test-words";
import { mountTimeline } from "./timeline";

const words = [scriptWord("w1", "Hello,", { duration: 500 }), scriptWord("w2", "world.", { start: 600, duration: 500 })];
const events = [{ id: "e1", name: "slide", anchor: "w2", offset: 0, time: 600 }];

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
  timeline.render(words, events, [], 1_100, [], locked);
  return { commands, pick, pickEvent, lock: () => timeline.render(words, events, [], 1_100, [], true) };
}

const pointer = (type: string, clientX: number) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });

function dragFirstWord() {
  const track = root.querySelector<HTMLElement>(".track")!;
  track.dispatchEvent(pointer("pointerdown", 50));
  track.dispatchEvent(pointer("pointermove", 90));
}

function dragFlag() {
  const flag = root.querySelector<HTMLElement>('[data-event-id="e1"]')!;
  flag.dispatchEvent(pointer("pointerdown", 120));
  root.querySelector<HTMLElement>(".track")!.dispatchEvent(pointer("pointermove", 180));
}

describe("the edit lock on the timeline", () => {
  it("picks but never drags while locked", () => {
    const { commands, pick } = mount(true);

    dragFirstWord();

    expect(pick).toHaveBeenCalledWith("w1", false);
    expect(commands.drag).not.toHaveBeenCalled();
    expect(root.classList.contains("locked")).toBe(true);
  });

  it("picks a Named Event's flag but never drags it while locked", () => {
    const { commands, pickEvent } = mount(true);

    dragFlag();

    expect(pickEvent).toHaveBeenCalledWith("e1");
    expect(commands.drag).not.toHaveBeenCalled();
  });

  it("drags a flag when unlocked", () => {
    const { commands } = mount(false);

    dragFlag();

    expect(commands.drag).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ kind: "moveEvent", event: "e1" }));
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
