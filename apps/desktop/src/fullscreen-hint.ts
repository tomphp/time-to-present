export type HintState = "shown" | "fading" | "hidden";

export const HINT_SHOWN_MS = 3000;
export const HINT_FADE_MS = 1000;

/** Shows the Fullscreen Hint each time the window goes Fullscreen, fades it after a few seconds, and hides it on Windowed. */
export function fullscreenHint(render: (state: HintState) => void) {
  let timers: ReturnType<typeof setTimeout>[] = [];
  const stop = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  return (fullscreen: boolean) => {
    stop();
    if (!fullscreen) return render("hidden");
    render("shown");
    timers = [
      setTimeout(() => render("fading"), HINT_SHOWN_MS),
      setTimeout(() => render("hidden"), HINT_SHOWN_MS + HINT_FADE_MS),
    ];
  };
}
