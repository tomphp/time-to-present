/** An in-window sheet asking for a Presentation's title: the title, or null when cancelled. */
export function titleDialog(form: HTMLFormElement): () => Promise<string | null> {
  const sheet = form.parentElement!;
  const input = form.querySelector<HTMLInputElement>("[name=title]")!;
  let answer: ((title: string | null) => void) | null = null;
  let opener: HTMLElement | null = null;

  function show(open: boolean) {
    sheet.hidden = !open;
    for (const behind of sheet.parentElement!.children) {
      if (behind !== sheet) behind.toggleAttribute("inert", open);
    }
  }

  function close(title: string | null) {
    show(false);
    opener?.focus();
    answer?.(title);
    answer = null;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (title) close(title);
  });
  form.querySelector("[data-cancel]")!.addEventListener("click", () => close(null));
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close(null);
  });

  return () => {
    answer?.(null);
    if (sheet.hidden) opener = document.activeElement as HTMLElement | null;
    input.value = "";
    show(true);
    input.focus();
    return new Promise((resolve) => (answer = resolve));
  };
}
