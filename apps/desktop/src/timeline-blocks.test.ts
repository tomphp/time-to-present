// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scriptWord } from "./test-words";
import { mountTimeline } from "./timeline";

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<section id="timeline"></section>';
  root = document.querySelector<HTMLElement>("#timeline")!;
});

const blockOf = (id: string) => root.querySelector<HTMLElement>(`[data-word-id="${id}"]`)!;

describe("Word Blocks on the timeline", () => {
  it("draws a 0 ms Word at least 6 px wide, above the Block it overlaps", () => {
    const commands = { drag: vi.fn(), waveform: vi.fn(async () => ({ bucket: 10, peaks: [] })) };
    const timeline = mountTimeline(root, commands, vi.fn(), vi.fn());

    timeline.render(
      [scriptWord("w1", "Hello,", { start: 500, duration: 0 }), scriptWord("w2", "world.", { start: 510, duration: 500 })],
      [],
      [],
      1_010,
      [],
      false,
    );

    expect(parseFloat(blockOf("w1").style.width)).toBeGreaterThanOrEqual(6);
    expect(Number(blockOf("w1").style.zIndex)).toBeGreaterThan(Number(blockOf("w2").style.zIndex));
  });
});
