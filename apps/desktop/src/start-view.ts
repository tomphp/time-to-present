import type { Recent } from "./commands";
import { find } from "./dom";
import { icon, type IconName } from "./icons";
import { folderName, recentList } from "./recent-list";
import { titleDialog } from "./title-dialog";

export interface StartCommands {
  pickFolder(prompt: string): Promise<string | null>;
  newPresentation(parent: string, title: string): Promise<unknown>;
  openFolder(folder: string): Promise<unknown>;
  recentPresentations(): Promise<Recent>;
  checkMicrophone(): Promise<void>;
}

export function mountStart(commands: StartCommands) {
  const notice = find<HTMLParagraphElement>("#notice");
  const error = find<HTMLParagraphElement>("#error");
  const askTitle = titleDialog(find<HTMLFormElement>("#title-dialog"));

  function clearBanners() {
    notice.hidden = true;
    error.hidden = true;
  }

  function showNotice(text: string) {
    notice.textContent = text;
    notice.hidden = false;
  }

  function showError(reason: unknown) {
    error.textContent = String(reason);
    error.hidden = false;
  }

  const openFolder = (folder: string) => {
    clearBanners();
    commands.openFolder(folder).catch(showError);
  };

  async function newPresentation() {
    const title = await askTitle();
    if (title === null) return;
    const parent = await commands.pickFolder("Choose where to make the Presentation folder");
    if (parent === null) return;
    clearBanners();
    await commands.newPresentation(parent, title).catch(showError);
  }

  async function pickAndOpen() {
    const folder = await commands.pickFolder("Open a Presentation folder");
    if (folder !== null) openFolder(folder);
  }

  async function checkMicrophone() {
    clearBanners();
    await commands.checkMicrophone().then(
      () => showNotice("Microphone access granted"),
      (reason) => showError(`Microphone access failed: ${reason}`),
    );
  }

  const actions: [string, IconName, () => unknown][] = [
    ["#new-presentation", "plus", newPresentation],
    ["#open-folder", "folder", pickAndOpen],
    ["#check-microphone", "mic", checkMicrophone],
  ];
  for (const [selector, name, action] of actions) {
    const button = find(selector);
    button.prepend(icon(name));
    button.addEventListener("click", () => void action());
  }

  const listRecent = recentList(find<HTMLUListElement>("#recent-list"), openFolder);
  void commands.recentPresentations().then(({ presentations, dropped }) => {
    listRecent(presentations);
    find("#recent-list").hidden = presentations.length === 0;
    find("#recent-empty").hidden = presentations.length > 0;
    if (dropped.length > 0) showNotice(`Removed from Recent, no longer found: ${dropped.map(folderName).join(", ")}`);
  }, showError);

  return { newPresentation: () => void newPresentation() };
}
