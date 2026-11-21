// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scriptWord } from "./test-words";
import { mountTimeline } from "./timeline";

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<section id="timeline"></section>';
  root = document.querySelector<HTMLElement>("#timeline")!;
});

function mount() {
  const commands = { drag: vi.fn(), waveform: vi.fn(async () => ({ bucket: 10, peaks: [] })) };
  const timeline = mountTimeline(root, commands, vi.fn(), vi.fn());
  timeline.render([scriptWord("w1", "Hello,", { duration: 500 })], [], [], 500, [], false);
  return timeline;
}

const playhead = () => root.querySelector<HTMLElement>(".playhead")!;

describe("the timeline playhead", () => {
  it("stands at the clock's Script Time", () => {
    const timeline = mount();

    timeline.playhead(1_500);

    expect(playhead().hidden).toBe(false);
    expect(playhead().style.left).toBe("300px");
  });

  it("is hidden until there is a clock to show", () => {
    const timeline = mount();
    timeline.playhead(1_500);

    timeline.playhead(null);

    expect(playhead().hidden).toBe(true);
  });
});
