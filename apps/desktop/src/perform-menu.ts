import { displays, performanceSettings, setPerformanceSettings } from "./commands";
import { find } from "./dom";
import { AUTOMATIC, chosenSettings, displayChoices } from "./perform-menu-view";
import { act } from "./report-error";
import type { Display } from "./session";

const menu = find<HTMLDetailsElement>("#perform-menu");
const layout = find<HTMLSelectElement>("#perform-layout");
const teleprompterDisplay = find<HTMLSelectElement>("#teleprompter-display");
const presentationDisplay = find<HTMLSelectElement>("#presentation-display");
const presentationSize = find<HTMLSelectElement>("#presentation-size");

function fill(select: HTMLSelectElement, connected: Display[], remembered: string | null) {
  select.replaceChildren(...displayChoices(connected, remembered).map(({ value, label }) => new Option(label, value)));
  select.value = remembered ?? AUTOMATIC;
}

async function show() {
  const [settings, connected] = await Promise.all([performanceSettings(), displays()]);
  layout.value = settings.layout;
  presentationSize.value = settings.presentationSize;
  fill(teleprompterDisplay, connected, settings.teleprompterDisplay);
  fill(presentationDisplay, connected, settings.presentationDisplay);
}

function remember(): Promise<void> {
  return setPerformanceSettings(
    chosenSettings({
      layout: layout.value,
      teleprompterDisplay: teleprompterDisplay.value,
      presentationDisplay: presentationDisplay.value,
      presentationSize: presentationSize.value,
    }),
  );
}

/** The Perform menu: the Performance Layout, each window's display and the Presentation Window's size. */
export function mountPerformMenu() {
  menu.addEventListener("toggle", () => {
    if (menu.open) act(show)();
  });
  for (const select of [layout, teleprompterDisplay, presentationDisplay, presentationSize]) {
    select.addEventListener("change", act(remember));
  }
}
