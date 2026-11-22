const error = () => document.querySelector<HTMLParagraphElement>("#error")!;

export function showError(reason: unknown) {
  const line = error();
  line.textContent = String(reason);
  line.hidden = false;
}

/** Wraps a command so its failure shows in the editor's error line and a retry clears it. */
export const act = (command: () => Promise<void>) => () => {
  error().hidden = true;
  command().catch(showError);
};
