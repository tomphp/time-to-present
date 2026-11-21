import type { LiveTranscript } from "./session";

export function liveTranscriptElement(live: LiveTranscript) {
  const span = document.createElement("span");
  span.className = "live-transcript";
  span.contentEditable = "false";
  fillLiveTranscript(span, live);
  return span;
}

/** Whether the Live Transcript sits in the same place, whatever it has heard. */
export function sameLivePlacement(a: LiveTranscript | null, b: LiveTranscript | null) {
  if (a === null || b === null) return a === b;
  return a.after === b.after && a.before === b.before;
}

/** Revises the Live Transcript under `root` in place and keeps it in view. */
export function refreshLiveTranscript(root: HTMLElement, live: LiveTranscript) {
  const span = root.querySelector<HTMLElement>(".live-transcript");
  if (!span) return;
  fillLiveTranscript(span, live);
  span.scrollIntoView({ block: "nearest" });
}

function fillLiveTranscript(span: HTMLElement, { words, failure }: LiveTranscript) {
  span.replaceChildren(words.join(" "));
  if (failure === null) return;
  const reason = document.createElement("span");
  reason.className = "live-failure";
  reason.textContent = `${words.length ? " " : ""}— ${failure}`;
  span.append(reason);
}
