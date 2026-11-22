import { completeName, eventEdit, type EventDraft } from "./named-events";
import type { Edit, SessionState } from "./session";

export interface EventEditorCommands {
  edit(edit: Edit): Promise<SessionState>;
  names(): string[];
  closed(): void;
}

/** The name and JSON data fields for a new or selected Named Event. */
export function mountEventEditor(form: HTMLFormElement, commands: EventEditorCommands) {
  const name = form.querySelector<HTMLInputElement>("[name=name]")!;
  const data = form.querySelector<HTMLTextAreaElement>("[name=data]")!;
  const names = form.querySelector<HTMLDataListElement>("datalist")!;
  const error = form.querySelector<HTMLElement>("[role=alert]")!;
  const deleteButton = form.querySelector<HTMLButtonElement>("[data-delete]")!;
  let draft: EventDraft | null = null;

  function open(next: EventDraft) {
    draft = next;
    const event = next.kind === "existing" ? next.event : null;
    name.value = event?.name ?? "";
    data.value = event?.data === undefined ? "" : JSON.stringify(event.data, null, 2);
    names.replaceChildren(...commands.names().map((value) => new Option(value)));
    showError(null);
    deleteButton.hidden = !event;
    form.hidden = false;
    name.focus();
    name.select();
  }

  function close() {
    if (!draft) return;
    draft = null;
    form.hidden = true;
    commands.closed();
  }

  const openEventId = () => (draft?.kind === "existing" ? draft.event.id : null);

  async function deleteOpen() {
    const event = openEventId();
    if (!event) return;
    await commands.edit({ kind: "deleteEvent", event }).then(close, (reason) => showError(String(reason)));
  }

  function showError(message: string | null) {
    error.textContent = message ?? "";
    error.hidden = message === null;
  }

  name.addEventListener("input", (event) => {
    if (!(event as InputEvent).inputType?.startsWith("insert") || name.selectionStart !== name.value.length) return;
    const typed = name.value;
    const completion = completeName(commands.names(), typed);
    if (!completion) return;
    name.value = completion;
    name.setSelectionRange(typed.length, completion.length);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!draft) return;
    const outcome = eventEdit(draft, name.value, data.value);
    if ("error" in outcome) return showError(outcome.error);
    await commands.edit(outcome.edit).then(close, (reason) => showError(String(reason)));
  });

  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "Backspace" && (event.metaKey || event.ctrlKey) && openEventId()) {
      event.preventDefault();
      void deleteOpen();
    }
    if (event.key === "Enter" && event.target === data && (event.metaKey || event.ctrlKey)) form.requestSubmit();
  });

  form.querySelector("[data-cancel]")!.addEventListener("click", close);
  deleteButton.addEventListener("click", deleteOpen);

  return { open, close, deleteOpen, openEventId };
}
