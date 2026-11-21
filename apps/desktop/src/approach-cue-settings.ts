import { longGapFromSeconds, type ApproachCueSettings } from "./approach-cue";
import { onApproachCue, setApproachCue } from "./commands";
import { find } from "./dom";

const form = find<HTMLFormElement>("#approach-cue");
const enabled = form.elements.namedItem("enabled") as HTMLInputElement;
const longGap = form.elements.namedItem("longGap") as HTMLInputElement;

let saved: ApproachCueSettings | null = null;

function show(settings: ApproachCueSettings) {
  saved = settings;
  enabled.checked = settings.enabled;
  longGap.value = String(settings.longGap / 1000);
}

form.addEventListener("change", () => {
  const threshold = longGapFromSeconds(longGap.value);
  if (threshold === null) {
    if (saved) show(saved);
    return;
  }
  void setApproachCue({ enabled: enabled.checked, longGap: threshold }).catch(console.error);
});
form.addEventListener("submit", (event) => event.preventDefault());

onApproachCue(show);
