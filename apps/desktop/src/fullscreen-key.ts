type Keys = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "isComposing">;

/** The keys that switch the Teleprompter Window between Fullscreen and Windowed, ahead of the rest of the keymap. */
export function fullscreenKey({ key, metaKey, ctrlKey, altKey, shiftKey, isComposing }: Keys): "leave" | "toggle" | null {
  if (isComposing) return null;
  if (key === "Escape") return "leave";
  if (altKey || shiftKey) return null;
  if (key.toLowerCase() === "f" && ctrlKey && metaKey) return "toggle";
  if (key === "F11" && !ctrlKey && !metaKey) return "toggle";
  return null;
}
