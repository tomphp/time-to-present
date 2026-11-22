import {
  displays,
  performanceSettings,
  sessionState,
  setPerformanceSettings,
  setPresentationSize,
  shownSize,
  sizePresets,
} from "./commands";
import { find } from "./dom";
import { AUTOMATIC, chosenSettings, displayChoices } from "./perform-menu-view";
import { CUSTOM, choiceFor, chosenSize, customSize, isValidPixels, shownNote, sizeChoices } from "./presentation-size-view";
import { act } from "./report-error";
import type { Display, PresentationSize, ShownSize, SizePreset } from "./session";

const menu = find<HTMLDetailsElement>("#perform-menu");
const layout = find<HTMLSelectElement>("#perform-layout");
const teleprompterDisplay = find<HTMLSelectElement>("#teleprompter-display");
const presentationDisplay = find<HTMLSelectElement>("#presentation-display");
const presentationSize = find<HTMLSelectElement>("#presentation-size");
const shownSizeNote = find<HTMLElement>("#shown-size");
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
  const { width, height } = saved === "fillDisplay" ? { width: 1920, height: 1080 } : saved;
  customWidth.value = String(width);
  customHeight.value = String(height);
  markValidity();
  showCustomFields();
}

function showCustomFields() {
  customFields.hidden = presentationSize.value !== CUSTOM;
}

function showShownSize(shown: ShownSize | null) {
  const note = shownNote(shown);
  shownSizeNote.hidden = note === null;
  shownSizeNote.textContent = note;
}

async function show() {
  const [settings, connected, presets, session, shown] = await Promise.all([
    performanceSettings(),
    displays(),
    sizePresets(),
    sessionState(),
    shownSize(),
  ]);
  layout.value = settings.layout;
  if (session) fillSizes(presets, session.presentationSize);
  showShownSize(shown);
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

function markValidity() {
  customWidth.setAttribute("aria-invalid", String(!isValidPixels(customWidth.value)));
  customHeight.setAttribute("aria-invalid", String(!isValidPixels(customHeight.value)));
}

async function saveSize() {
  showCustomFields();
  if (presentationSize.value !== CUSTOM) await setPresentationSize(chosenSize(presentationSize.value));
  else {
    markValidity();
    const size = customSize(customWidth.value, customHeight.value);
    if (!size) return;
    await setPresentationSize(size);
  }
  showShownSize(await shownSize());
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
