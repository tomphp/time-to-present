import type { ScriptWord, Waveform } from "./session";
import { waveformBars, type Block } from "./timeline-geometry";

const WAVEFORM_HEIGHT = 28;

/** A Word's block on the timeline, redrawing its waveform only when what it shows has changed. */
export function timelineBlock(id: string) {
  const element = document.createElement("div");
  element.dataset.wordId = id;
  const label = document.createElement("span");
  const canvas = document.createElement("canvas");
  element.append(label, canvas);
  let drawn = "";

  function update(word: ScriptWord, { left, width }: Block, selected: boolean, waveform: Waveform | null) {
    element.className = `block ${word.recordingId ? "spoken" : "typed"}`;
    element.classList.toggle("selected", selected);
    element.style.left = `${left}px`;
    element.style.width = `${width}px`;
    label.textContent = word.text;
    const shown = [width, word.audioStart, word.audioEnd, waveform !== null].join(" ");
    if (shown === drawn) return;
    drawn = shown;
    draw(waveform ? waveformBars(waveform, word, Math.max(1, Math.floor(width))) : [], width);
  }

  function draw(bars: number[], width: number) {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = WAVEFORM_HEIGHT * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${WAVEFORM_HEIGHT}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.fillStyle = getComputedStyle(canvas).color;
    bars.forEach((level, x) => {
      const height = Math.max(1, level * WAVEFORM_HEIGHT);
      context.fillRect(x, (WAVEFORM_HEIGHT - height) / 2, 1, height);
    });
  }

  return { element, update };
}
