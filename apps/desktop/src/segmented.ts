export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedOptions<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function segmented<T extends string>({ label, options, value, onChange }: SegmentedOptions<T>) {
  const element = document.createElement("div");
  element.className = "segmented";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", label);
  const buttons = options.map(({ label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    return button;
  });
  const show = (chosen: T) =>
    buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(options[i].value === chosen)));
  buttons.forEach((button, i) =>
    button.addEventListener("click", () => {
      show(options[i].value);
      onChange(options[i].value);
    }),
  );
  element.append(...buttons);
  show(value);
  return { element, show };
}
