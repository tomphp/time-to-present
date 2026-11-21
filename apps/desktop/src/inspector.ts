import type { Edit, ScriptWord, SessionState, TimedEvent } from "./session";
import { fieldEdit, offsetEdit, retimeEdit } from "./timing-controls";

export interface InspectorCommands {
  edit(edit: Edit): Promise<SessionState>;
}

/** Numeric fields for the selected Word's `gap` and `duration` or Named Event's `offset`, and Retime. */
export function mountInspector(form: HTMLFormElement, commands: InspectorCommands) {
  const input = (name: string) => form.querySelector<HTMLInputElement>(`[name=${name}]`)!;
  const [gap, duration, offset, percent] = ["gap", "duration", "offset", "percent"].map(input);
  const wordFields = form.querySelector<HTMLElement>("[data-word]")!;
  const eventFields = form.querySelector<HTMLElement>("[data-event]")!;
  const error = form.querySelector<HTMLElement>("[role=alert]")!;
  let words: ScriptWord[] = [];
  let ids: string[] = [];
  let event: TimedEvent | null = null;

  function render(next: ScriptWord[], selected: string[], selectedEvent: TimedEvent | null) {
    words = next;
    ids = selected;
    event = selectedEvent;
    const first = words.find((word) => word.id === ids[0]);
    form.hidden = !first && !event;
    wordFields.hidden = !first;
    eventFields.hidden = !event;
    show(gap, first?.gap);
    show(duration, first?.duration);
    show(offset, event?.offset);
  }

  function show(field: HTMLInputElement, value: number | undefined) {
    if (value !== undefined && document.activeElement !== field) field.value = String(value);
  }

  async function send(edit: Edit | null) {
    error.hidden = true;
    if (!edit) return render(words, ids, event);
    await commands.edit(edit).catch((reason) => {
      error.textContent = String(reason);
      error.hidden = false;
    });
  }

  for (const field of [gap, duration]) {
    field.addEventListener("change", () => {
      const word = words.find((candidate) => candidate.id === ids[0]);
      return send(word ? fieldEdit(field.name as "gap" | "duration", word, field.value) : null);
    });
  }
  offset.addEventListener("change", () => send(event ? offsetEdit(event.id, offset.value) : null));
  form.addEventListener("submit", (submitted) => {
    submitted.preventDefault();
    return send(retimeEdit(ids, percent.value));
  });

  return { render };
}
