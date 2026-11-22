import { mountEventEditor, type EventEditorCommands } from "./event-editor";
import { showAs } from "./icon-button";
import type { EventDraft } from "./named-events";
import type { Edit, ScriptWord, TimedEvent } from "./session";
import { fieldEdit, offsetEdit, retimeEdit } from "./timing-controls";

export interface InspectorCommands extends EventEditorCommands {
  shownChanged(shown: boolean): void;
}

/**
 * The sidebar card beside the Script: the selection's timing, the Named Event being edited, or a
 * hint when nothing is selected. Hiding it keeps it hidden through selections; adding a Named
 * Event or Retime… shows it again.
 */
export function mountInspector(card: HTMLElement, commands: InspectorCommands, initiallyShown: boolean) {
  const body = card.querySelector<HTMLElement>("[data-body]")!;
  const title = card.querySelector<HTMLElement>("[data-title]")!;
  const toggleButton = card.querySelector<HTMLButtonElement>("[data-toggle]")!;
  const hint = card.querySelector<HTMLElement>("[data-hint]")!;
  const timing = card.querySelector<HTMLFormElement>("#timing")!;
  const eventForm = card.querySelector<HTMLFormElement>("#event-editor")!;
  const input = (form: HTMLFormElement, name: string) => form.querySelector<HTMLInputElement>(`[name=${name}]`)!;
  const [gap, duration, percent] = ["gap", "duration", "percent"].map((name) => input(timing, name));
  const offset = input(eventForm, "offset");
  const offsetField = eventForm.querySelector<HTMLElement>("[data-offset]")!;
  const lockable = [...timing.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button"), offset];
  const eventEditor = mountEventEditor(eventForm, {
    ...commands,
    closed: () => {
      showMode();
      commands.closed();
    },
  });
  let words: ScriptWord[] = [];
  let ids: string[] = [];
  let event: TimedEvent | null = null;
  let locked = false;
  let shown = initiallyShown;

  function render(next: ScriptWord[], selected: string[], selectedEvent: TimedEvent | null, lock: boolean) {
    words = next;
    ids = selected;
    event = selectedEvent;
    locked = lock;
    lockable.forEach((control) => (control.disabled = locked));
    showMode();
  }

  function showMode() {
    const editing = !eventForm.hidden;
    const word = selectedWord();
    timing.hidden = editing || !word;
    hint.hidden = editing || !!word;
    offsetField.hidden = !event;
    show(gap, word?.gap);
    show(duration, word?.duration);
    show(offset, event?.offset);
  }

  const selectedWord = () => words.find((word) => word.id === ids[0]);

  function show(field: HTMLInputElement, value: number | undefined) {
    if (value !== undefined && document.activeElement !== field) field.value = String(value);
  }

  function setShown(next: boolean) {
    body.hidden = title.hidden = !next;
    showAs(toggleButton, { icon: "sidebar", label: next ? "Hide Inspector" : "Show Inspector" });
    if (next === shown) return;
    shown = next;
    commands.shownChanged(shown);
  }

  async function send(edit: Edit | null, form: HTMLFormElement) {
    const error = form.querySelector<HTMLElement>("[role=alert]")!;
    error.hidden = true;
    if (!edit) return showMode();
    await commands.edit(edit).catch((reason) => {
      error.textContent = String(reason);
      error.hidden = false;
    });
  }

  for (const field of [gap, duration, offset]) {
    field.addEventListener("keydown", (key) => {
      if (key.key !== "Enter") return;
      key.preventDefault();
      field.blur();
    });
  }
  for (const field of [gap, duration]) {
    field.addEventListener("change", () => {
      const word = selectedWord();
      return send(word ? fieldEdit(field.name as "gap" | "duration", word, field.value) : null, timing);
    });
  }
  offset.addEventListener("change", () => send(event ? offsetEdit(event.id, offset.value) : null, eventForm));
  timing.addEventListener("submit", (submitted) => {
    submitted.preventDefault();
    return send(retimeEdit(ids, percent.value), timing);
  });
  const toggle = () => setShown(!shown);
  toggleButton.addEventListener("click", toggle);
  setShown(shown);

  /** Adding a Named Event shows the Inspector; selecting one leaves a hidden Inspector hidden. */
  function openEvent(draft: EventDraft) {
    if (draft.kind === "new") setShown(true);
    eventEditor.open(draft);
    showMode();
  }

  function retime() {
    setShown(true);
    if (timing.hidden || locked) return;
    percent.focus();
    percent.select();
  }

  return {
    render,
    openEvent,
    closeEvent: eventEditor.close,
    retime,
    toggle,
    shown: () => shown,
  };
}
