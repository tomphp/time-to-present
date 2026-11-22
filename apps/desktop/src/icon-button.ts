import { icon, type IconName } from "./icons";

export interface IconButtonOptions {
  icon: IconName;
  label: string;
  shortcut?: string;
}

export function iconButton({ icon: name, label, shortcut }: IconButtonOptions): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn";
  button.setAttribute("aria-label", label);
  button.dataset.tooltip = shortcut ? `${label} (${shortcut})` : label;
  button.append(icon(name));
  return button;
}
