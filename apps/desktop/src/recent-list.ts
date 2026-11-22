import type { RecentPresentation } from "./commands";

export const folderName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

/** The Recent listbox: a click selects a row, double-click or Return opens it. */
export function recentList(list: HTMLUListElement, open: (folder: string) => void) {
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

  list.addEventListener("keydown", (event) => {
    const last = folders.length - 1;
    if (event.key === "Enter" && selected !== null) open(folders[selected]);
    else if (event.key === "ArrowDown" && last >= 0) select(selected === null ? 0 : Math.min(selected + 1, last));
    else if (event.key === "ArrowUp" && last >= 0) select(selected === null ? last : Math.max(selected - 1, 0));
    else return;
    event.preventDefault();
  });

  return (presentations: RecentPresentation[]) => {
    folders = presentations.map(({ folder }) => folder);
    selected = null;
    list.replaceChildren(...presentations.map(row));
  };
}
