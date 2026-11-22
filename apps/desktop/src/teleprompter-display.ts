import { applyAction, loadOptions, mirrorFor, saveOptions, type DisplayAction, type DisplayOptions } from "./display-options";
import type { WindowReport } from "./session";

export interface DisplayHost {
  storage: Pick<Storage, "getItem" | "setItem">;
  screenKey: () => string;
  render: (options: DisplayOptions, blanked: boolean) => void;
  report: (report: Extract<WindowReport, { window: "teleprompter" }>) => void;
}

/** The Teleprompter's display options and Blank Screen, however they change: it renders and reports each change. */
export function mountDisplay({ storage, screenKey, render, report }: DisplayHost) {
  let options = loadOptions(storage);
  let blanked = false;

  const show = () => {
    render(options, blanked);
    const { horizontal, vertical } = mirrorFor(options, screenKey());
    report({
      window: "teleprompter",
      blanked,
      markers: options.markers,
      mirrored: horizontal,
      flipped: vertical,
      ticker: options.view === "ticker",
    });
  };

  show();
  return {
    perform(action: DisplayAction) {
      if (action === "blank") blanked = !blanked;
      else {
        options = applyAction(options, action, screenKey());
        saveOptions(storage, options);
      }
      show();
    },
  };
}
