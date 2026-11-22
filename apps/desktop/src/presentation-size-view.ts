import type { PresentationSize, Shape, SizePreset } from "./session";
import type { Choice } from "./perform-menu-view";

const FILL_DISPLAY = "fillDisplay";

const SHAPES: Record<Shape, { group: string; label: string }> = {
  landscape: { group: "Landscape 16:9", label: "16:9 landscape" },
  vertical: { group: "Vertical 9:16", label: "9:16 vertical" },
  square: { group: "Square 1:1", label: "1:1 square" },
  portrait: { group: "Portrait 4:5", label: "4:5 portrait" },
};

export interface ChoiceGroup {
  group: string;
  choices: Choice[];
}

/** The core's Size Presets grouped by shape, then Fill display. */
export function sizeChoices(presets: SizePreset[]): (ChoiceGroup | Choice)[] {
  const groups = new Map<Shape, Choice[]>();
  for (const { width, height, shape } of presets) {
    const choice = { value: sizeValue({ width, height }), label: `${width}×${height} (${SHAPES[shape].label})` };
    groups.set(shape, [...(groups.get(shape) ?? []), choice]);
  }
  return [
    ...[...groups].map(([shape, choices]) => ({ group: SHAPES[shape].group, choices })),
    { value: FILL_DISPLAY, label: "Fill display" },
  ];
}

export function sizeValue(size: PresentationSize): string {
  return size === FILL_DISPLAY ? FILL_DISPLAY : `${size.width}x${size.height}`;
}

export function chosenSize(value: string): PresentationSize {
  if (value === FILL_DISPLAY) return FILL_DISPLAY;
  const pixels = /^(\d+)x(\d+)$/.exec(value);
  if (!pixels) throw new Error(`Unknown Presentation Size: ${value}`);
  return { width: Number(pixels[1]), height: Number(pixels[2]) };
}
