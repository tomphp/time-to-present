export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface Segmented<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function segmented<T extends string>({ label, options, value, onChange }: Segmented<T>) {
  const element = document.createElement("div");
  element.className = "segmented";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", label);
  const buttons = options.map((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.addEventListener("click", () => {
      show(option.value);
      onChange(option.value);
    });
    return button;
  });
  const show = (chosen: T) =>
    buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(options[i].value === chosen)));
  element.append(...buttons);
  show(value);
  return { element, show };
}
