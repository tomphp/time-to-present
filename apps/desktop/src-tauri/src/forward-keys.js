// Injected into every page the Presentation Window loads, and into the frames of the Teleprompter
// Window, where the app pane posts its keys to the Teleprompter's own page to forward. The core
// decides which keys are Performance keys; the page still sees every key, as nothing is prevented.
(() => {
  const framed = window.top !== window;
  const send = (key) =>
    framed
      ? window.parent.postMessage({ forwardedKey: key }, "*")
      : window.__TAURI_INTERNALS__.invoke("forward_key", { key }).catch(console.error);

  window.addEventListener(
    "keydown",
    (event) => {
      if (window.forwardFromFramesOnly && !framed) return;
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
      send(key);
    },
    true,
  );
})();
