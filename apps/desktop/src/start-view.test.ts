// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import page from "../index.html?raw";
import type { Recent } from "./commands";
import { mountStart, type StartCommands } from "./start-view";

let commands: { [K in keyof StartCommands]: ReturnType<typeof vi.fn> & StartCommands[K] };
let start: ReturnType<typeof mountStart>;

const find = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const settled = () => new Promise((resolve) => setTimeout(resolve));
const visible = (selector: string) => !find(selector).closest("[hidden]");
const recent = (overrides: Partial<Recent> = {}): Recent => ({ presentations: [], dropped: [], ...overrides });
const rows = () => [...document.querySelectorAll<HTMLElement>("#recent-list [role=option]")];

async function mount(listed: Recent = recent()) {
  commands = {
    pickFolder: vi.fn(async () => "/Users/tom/Talks"),
    newPresentation: vi.fn(async () => {}),
    openFolder: vi.fn(async () => {}),
    recentPresentations: vi.fn(async () => listed),
    checkMicrophone: vi.fn(async () => {}),
  } as typeof commands;
  start = mountStart(commands);
  await settled();
}

function typeTitle(title: string) {
  find<HTMLInputElement>("#title-dialog [name=title]").value = title;
  find<HTMLFormElement>("#title-dialog").requestSubmit();
}

beforeEach(() => {
  document.documentElement.innerHTML = page.replace(/^<!doctype html>/i, "");
});

describe("New Presentation", () => {
  it("asks for the title before the folder", async () => {
    await mount();

    find("#new-presentation").click();

    expect(visible("#title-dialog")).toBe(true);
    expect(commands.pickFolder).not.toHaveBeenCalled();

    typeTitle("Keynote");
    await settled();

    expect(visible("#title-dialog")).toBe(false);
    expect(commands.pickFolder).toHaveBeenCalledOnce();
    expect(commands.newPresentation).toHaveBeenCalledWith("/Users/tom/Talks", "Keynote");
  });

  it("does nothing when the title dialog is cancelled", async () => {
    await mount();

    find("#new-presentation").click();
    find("#title-dialog [data-cancel]").click();
    start.newPresentation();
    find("#title-dialog").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settled();

    expect(visible("#title-dialog")).toBe(false);
    expect(commands.pickFolder).not.toHaveBeenCalled();
    expect(commands.newPresentation).not.toHaveBeenCalled();
  });

  it("keeps the window behind out of reach while it asks", async () => {
    await mount();
    const behind = [find(".start-actions"), find(".recent")];

    start.newPresentation();
    expect(behind.map((element) => element.hasAttribute("inert"))).toEqual([true, true]);

    typeTitle("Keynote");
    expect(behind.map((element) => element.hasAttribute("inert"))).toEqual([false, false]);
  });

  it("keeps asking while the title is blank", async () => {
    await mount();

    start.newPresentation();
    typeTitle("   ");
    await settled();

    expect(visible("#title-dialog")).toBe(true);
    expect(commands.pickFolder).not.toHaveBeenCalled();
  });

  it("creates nothing when the folder picker is cancelled", async () => {
    await mount();
    commands.pickFolder.mockResolvedValue(null);

    start.newPresentation();
    typeTitle("Keynote");
    await settled();

    expect(commands.newPresentation).not.toHaveBeenCalled();
  });

  it("shows why the Presentation could not be made", async () => {
    await mount();
    commands.newPresentation.mockRejectedValue("/Users/tom/Talks/Keynote already exists");

    start.newPresentation();
    typeTitle("Keynote");
    await settled();

    expect(visible("#error")).toBe(true);
    expect(find("#error").textContent).toBe("/Users/tom/Talks/Keynote already exists");
  });
});

describe("the Recent list", () => {
  const listed = recent({
    presentations: [
      { folder: "/Users/tom/Talks/Keynote", title: "Keynote: the sequel" },
      { folder: "/Users/tom/Talks/Broken", title: null },
    ],
  });

  it("shows each Presentation's title and folder path", async () => {
    await mount(listed);

    expect(rows().map((row) => row.textContent)).toEqual([
      "Keynote: the sequel/Users/tom/Talks/Keynote",
      "Broken/Users/tom/Talks/Broken",
    ]);
    expect(visible("#recent-empty")).toBe(false);
  });

  it("says when there is nothing recent", async () => {
    await mount();

    expect(rows()).toEqual([]);
    expect(visible("#recent-empty")).toBe(true);
  });

  it("opens a Presentation on double-click", async () => {
    await mount(listed);

    rows()[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(commands.openFolder).toHaveBeenCalledWith("/Users/tom/Talks/Broken");
  });

  it("selects a row on a single click and opens it on Return", async () => {
    await mount(listed);

    rows()[1].click();

    expect(commands.openFolder).not.toHaveBeenCalled();
    expect(rows().map((row) => row.getAttribute("aria-selected"))).toEqual(["false", "true"]);

    find("#recent-list").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(commands.openFolder).toHaveBeenCalledWith("/Users/tom/Talks/Broken");
  });

  it("moves the selection with the arrow keys", async () => {
    await mount(listed);
    const list = find("#recent-list");

    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(commands.openFolder).toHaveBeenCalledWith("/Users/tom/Talks/Keynote");
  });

  it("opens nothing on Return before a row is selected", async () => {
    await mount(listed);

    find("#recent-list").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(commands.openFolder).not.toHaveBeenCalled();
  });

  it("shows the Presentations dropped from Recent in a banner", async () => {
    await mount(recent({ dropped: ["/Users/tom/Talks/Gone", "/Users/tom/Old"] }));

    expect(visible("#notice")).toBe(true);
    expect(find("#notice").textContent).toBe("Removed from Recent, no longer found: Gone, Old");
  });
});

describe("Open Folder…", () => {
  it("opens the folder chosen", async () => {
    await mount();

    find("#open-folder").click();
    await settled();

    expect(commands.openFolder).toHaveBeenCalledWith("/Users/tom/Talks");
  });
});

describe("Check microphone", () => {
  it("shows that access was granted in a banner", async () => {
    await mount();

    find("#check-microphone").click();
    await settled();

    expect(visible("#notice")).toBe(true);
    expect(find("#notice").textContent).toBe("Microphone access granted");
  });

  it("shows why access failed in a banner", async () => {
    await mount();
    commands.checkMicrophone.mockRejectedValue("NotAllowedError");

    find("#check-microphone").click();
    await settled();

    expect(visible("#error")).toBe(true);
    expect(find("#error").textContent).toBe("Microphone access failed: NotAllowedError");
  });
});

it("has no Settings button: ⌘, in the app menu opens Settings", async () => {
  await mount();

  expect([...document.querySelectorAll("button")].map((button) => button.textContent)).not.toContain("Settings…");
});
