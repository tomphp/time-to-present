import { displays, performanceSettings, setPerformanceSettings, sizePresets } from "./commands";
import { find } from "./dom";
import { AUTOMATIC, chosenSettings, displayChoices } from "./perform-menu-view";
import { sizeChoices, sizeValue } from "./presentation-size-view";
import { act } from "./report-error";
import type { Display, PresentationSize, SizePreset } from "./session";

const menu = find<HTMLDetailsElement>("#perform-menu");
const layout = find<HTMLSelectElement>("#perform-layout");
const teleprompterDisplay = find<HTMLSelectElement>("#teleprompter-display");
const presentationDisplay = find<HTMLSelectElement>("#presentation-display");
const presentationSize = find<HTMLSelectElement>("#presentation-size");

function fill(select: HTMLSelectElement, connected: Display[], remembered: string | null) {
  select.replaceChildren(...displayChoices(connected, remembered).map(({ value, label }) => new Option(label, value)));
  select.value = remembered ?? AUTOMATIC;
}

function fillSizes(presets: SizePreset[], saved: PresentationSize) {
  const options = sizeChoices(presets).map((entry) => {
    if (!("group" in entry)) return new Option(entry.label, entry.value);
    const group = document.createElement("optgroup");
    group.label = entry.group;
    group.append(...entry.choices.map(({ value, label }) => new Option(label, value)));
    return group;
  });
  presentationSize.replaceChildren(...options);
  presentationSize.value = sizeValue(saved);
}

async function show() {
  const [settings, connected, presets] = await Promise.all([performanceSettings(), displays(), sizePresets()]);
  layout.value = settings.layout;
  fillSizes(presets, settings.presentationSize);
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
