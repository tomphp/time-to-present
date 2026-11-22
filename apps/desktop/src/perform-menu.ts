import {
  displays,
  performanceSettings,
  sessionState,
  setPerformanceSettings,
  setPresentationSize,
  sizePresets,
} from "./commands";
import { find } from "./dom";
import { AUTOMATIC, chosenSettings, displayChoices } from "./perform-menu-view";
import { CUSTOM, choiceFor, chosenSize, customSize, isValidPixels, sizeChoices } from "./presentation-size-view";
import { act } from "./report-error";
import type { Display, PresentationSize, SizePreset } from "./session";

const menu = find<HTMLDetailsElement>("#perform-menu");
const layout = find<HTMLSelectElement>("#perform-layout");
const teleprompterDisplay = find<HTMLSelectElement>("#teleprompter-display");
const presentationDisplay = find<HTMLSelectElement>("#presentation-display");
const presentationSize = find<HTMLSelectElement>("#presentation-size");
const customFields = find<HTMLElement>("#custom-size");
const customWidth = find<HTMLInputElement>("#custom-width");
const customHeight = find<HTMLInputElement>("#custom-height");

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
  presentationSize.value = choiceFor(saved, presets);
  if (saved !== "fillDisplay") [customWidth.value, customHeight.value] = [String(saved.width), String(saved.height)];
  showCustomFields();
}

function showCustomFields() {
  customFields.hidden = presentationSize.value !== CUSTOM;
}

async function show() {
  const [settings, connected, presets, session] = await Promise.all([
    performanceSettings(),
    displays(),
    sizePresets(),
    sessionState(),
  ]);
  layout.value = settings.layout;
  if (session) fillSizes(presets, session.presentationSize);
  fill(teleprompterDisplay, connected, settings.teleprompterDisplay);
  fill(presentationDisplay, connected, settings.presentationDisplay);
}

function remember(): Promise<void> {
  return setPerformanceSettings(
    chosenSettings({
      layout: layout.value,
      teleprompterDisplay: teleprompterDisplay.value,
      presentationDisplay: presentationDisplay.value,
    }),
  );
}

async function saveSize() {
  showCustomFields();
  if (presentationSize.value !== CUSTOM) return setPresentationSize(chosenSize(presentationSize.value));
  customWidth.setAttribute("aria-invalid", String(!isValidPixels(customWidth.value)));
  customHeight.setAttribute("aria-invalid", String(!isValidPixels(customHeight.value)));
  const size = customSize(customWidth.value, customHeight.value);
  if (size) await setPresentationSize(size);
}

/** The Perform menu: this machine's Performance Layout and displays, and the Presentation's own size. */
export function mountPerformMenu() {
  menu.addEventListener("toggle", () => {
    if (menu.open) act(show)();
  });
  for (const select of [layout, teleprompterDisplay, presentationDisplay]) {
    select.addEventListener("change", act(remember));
  }
  for (const field of [presentationSize, customWidth, customHeight]) field.addEventListener("change", act(saveSize));
}
