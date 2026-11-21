// Injected into every page the Presentation Window loads. The core decides which keys are
// Performance keys; the page still sees every key, as nothing is prevented.
window.addEventListener(
  "keydown",
  (event) => {
    const [first] = event.composedPath();
    const element = first instanceof Element ? first : document.body;
    const target = {
      tag: element.tagName,
      inputType: element instanceof HTMLInputElement ? element.type : null,
      editable: element.isContentEditable === true,
    };
    const key = {
      key: event.key,
      meta: event.metaKey,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      repeat: event.repeat,
      composing: event.isComposing,
      target,
    };
    window.__TAURI_INTERNALS__.invoke("forward_key", { key }).catch(() => {});
  },
  true,
);
