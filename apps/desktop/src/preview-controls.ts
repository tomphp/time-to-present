import { listenTarget } from "./audio-schedule";
import { clockPosition, DISCONNECTED, type ClockPanel } from "./clock-view";
import { preview, recordingClip } from "./commands";
import { find } from "./dom";
import { editorAudio } from "./editor-audio";
import { act, showError } from "./report-error";
import { previewFrom } from "./selection";
import type { InsertionPoint, SessionState, StreamEvent } from "./session";

export interface PreviewTargets {
  selected(): string[];
  insertionPoint(): InsertionPoint;
  highlight(word: string | null): void;
  playhead(time: number | null): void;
}

/**
 * Listen and Preview: the buttons, the sound, and following the clock with the text highlight
 * and the timeline playhead, which runs on smoothly between ticks while the clock plays.
 */
export function mountPreview(targets: PreviewTargets) {
  const previewButton = find<HTMLButtonElement>("#preview");
  const listenButton = find<HTMLButtonElement>("#listen");
  const audio = editorAudio(recordingClip);
  let state: SessionState | null = null;
  let panel = DISCONNECTED;
  let reportedAt = 0;
  let frame = 0;

  const listenable = () => (state ? listenTarget(state.words, targets.selected(), state.locked) : null);

  function renderButtons() {
    previewButton.disabled = !state || state.locked;
    listenButton.disabled = !listenable();
  }

  function followPlayhead() {
    const elapsed = performance.now() - reportedAt;
    targets.playhead(panel.state === null ? null : clockPosition(panel, elapsed, state?.scriptEnd ?? 0));
    frame = panel.state === "playing" ? requestAnimationFrame(followPlayhead) : 0;
  }

  document.addEventListener("pointerdown", audio.wake);
  document.addEventListener("keydown", audio.wake);

  previewButton.addEventListener(
    "click",
    act(async () => {
      if (!state) return;
      await preview(previewFrom(state.words, targets.selected(), targets.insertionPoint()));
    }),
  );

  listenButton.addEventListener("click", () => {
    const clip = listenable();
    if (clip) audio.listen(clip).catch(showError);
  });

  return {
    render(next: SessionState) {
      state = next;
      audio.script(next);
      renderButtons();
    },
    selectionChanged: renderButtons,
    clock(next: ClockPanel, event: StreamEvent) {
      panel = next;
      reportedAt = performance.now();
      audio.clock(next, event);
      targets.highlight(next.currentWord?.id ?? null);
      if (!frame) followPlayhead();
    },
  };
}
