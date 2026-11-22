import { icon, type IconName } from "./icons";

export interface IconButtonOptions {
  icon: IconName;
  label: string;
  shortcut?: string;
}

export function iconButton(options: IconButtonOptions): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn";
  showAs(button, options);
  return button;
}

/** Gives an icon button its icon, name and tooltip, for buttons in the page and buttons that change. */
export function showAs(button: HTMLElement, { icon: name, label, shortcut }: IconButtonOptions) {
  button.setAttribute("aria-label", label);
  button.dataset.tooltip = shortcut ? `${label} (${shortcut})` : label;
  button.replaceChildren(icon(name));
}
