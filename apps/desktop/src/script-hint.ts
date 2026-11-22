export const SCRIPT_HINT = "Press Record (⌘R) to speak your talk, or start typing";

export function renderScriptHint(element: HTMLElement, wordCount: number) {
  element.textContent = SCRIPT_HINT;
  element.hidden = wordCount > 0;
}
