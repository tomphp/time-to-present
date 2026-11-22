import type { RecentPresentation } from "./commands";

export const folderName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

/** The Recent listbox: a click selects a row, double-click or Return opens it. */
export function recentList(list: HTMLUListElement, empty: HTMLElement, open: (folder: string) => void) {
  let folders: string[] = [];
  let selected: number | null = null;

  const rows = () => [...list.children] as HTMLElement[];

  function select(index: number) {
    selected = index;
    rows().forEach((row, at) => row.setAttribute("aria-selected", String(at === index)));
    rows()[index].scrollIntoView?.({ block: "nearest" });
  }

  function row({ folder, title }: RecentPresentation, index: number) {
    const name = document.createElement("span");
    name.className = "recent-title";
    name.textContent = title ?? folderName(folder);
    const path = document.createElement("span");
    path.className = "recent-path";
    path.textContent = folder;
    const item = document.createElement("li");
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.append(name, path);
    item.addEventListener("click", () => select(index));
    item.addEventListener("dblclick", () => open(folder));
    return item;
  }

  function move(by: 1 | -1) {
    if (folders.length === 0) return;
    const from = selected ?? (by === 1 ? -1 : folders.length);
    select(Math.min(Math.max(from + by, 0), folders.length - 1));
  }

  const keys: Record<string, () => void> = {
    Enter: () => selected !== null && open(folders[selected]),
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
  };

  list.addEventListener("keydown", (event) => {
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });

  return (presentations: RecentPresentation[]) => {
    folders = presentations.map(({ folder }) => folder);
    selected = null;
    list.replaceChildren(...presentations.map(row));
    list.hidden = presentations.length === 0;
    empty.hidden = presentations.length > 0;
  };
}
