import type { ForwardedKey } from "./session";

export function asKeydown({ key, meta, ctrl, alt, shift, repeat }: ForwardedKey): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, metaKey: meta, ctrlKey: ctrl, altKey: alt, shiftKey: shift, repeat });
}
