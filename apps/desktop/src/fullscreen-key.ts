type Keys = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** The keys that switch the Teleprompter Window between Fullscreen and Windowed, ahead of the rest of the keymap. */
export function fullscreenKey({ key, metaKey, ctrlKey, altKey, shiftKey }: Keys): "leave" | "toggle" | null {
  if (key === "Escape") return "leave";
  if (key.toLowerCase() === "f" && ctrlKey && metaKey && !altKey && !shiftKey) return "toggle";
  return null;
}
