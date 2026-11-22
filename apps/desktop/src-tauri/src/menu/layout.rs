use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{App, Wry};
use ttp_core::menu::{MenuCommand, MenuItemState};

/// A line of a menu the shell builds: one of the model's items, a separator, a submenu or the
/// Recent list.
enum Entry {
    Command(MenuCommand),
    Separator,
    Submenu(&'static str, &'static [Entry]),
    OpenRecent,
}

use Entry::{Command, Separator};
use MenuCommand::*;

const FILE: &[Entry] = &[
    Command(NewPresentation),
    Command(OpenFolder),
    Entry::OpenRecent,
    Separator,
    Command(RemoveUnusedRecordings),
];
const SCRIPT: &[Entry] = &[
    Command(Record),
    Command(ReRecordSelection),
    Separator,
    Command(AddNamedEvent),
    Command(DeleteNamedEvent),
    Command(Retime),
    Separator,
    Command(Listen),
];
const PERFORM: &[Entry] = &[
    Command(Perform),
    Entry::Submenu(
        "Performance Layout",
        &[
            Command(LayoutTwoWindows),
            Command(LayoutCombined),
            Command(LayoutTeleprompterOnly),
        ],
    ),
    Separator,
    Command(PlayPause),
    Command(PlayFromCursor),
    Command(Restart),
];
const VIEW: &[Entry] = &[
    Command(ToggleFullscreen),
    Separator,
    Command(ToggleInspector),
    Command(ToggleTimeline),
    Separator,
    Entry::Submenu(
        "Teleprompter",
        &[
            Command(Blank),
            Command(Markers),
            Separator,
            Command(Mirror),
            Command(Flip),
            Separator,
            Command(FontLarger),
            Command(FontSmaller),
            Command(ReadingLineUp),
            Command(ReadingLineDown),
        ],
    ),
];

#[derive(Clone)]
pub enum Item {
    Plain(MenuItem<Wry>),
    Check(CheckMenuItem<Wry>),
}

impl Item {
    fn append_to(&self, submenu: &Submenu<Wry>) -> tauri::Result<()> {
        match self {
            Item::Plain(item) => submenu.append(item),
            Item::Check(item) => submenu.append(item),
        }
    }

    pub fn show(&self, offered: MenuItemState) -> tauri::Result<()> {
        match self {
            Item::Plain(item) => {
                item.set_enabled(offered.enabled)?;
                item.set_text(offered.label)
            }
            Item::Check(item) => {
                item.set_enabled(offered.enabled)?;
                item.set_text(offered.label)?;
                item.set_checked(offered.checked)
            }
        }
    }
}

/// The items the menu model decides, and the Open Recent submenu.
pub struct Items {
    pub commands: Vec<(MenuCommand, Item)>,
    pub open_recent: Submenu<Wry>,
}

/// The menu bar in the Spec's order, with the items `refresh` updates and the empty Open Recent.
pub fn menu_bar(app: &App) -> tauri::Result<(Menu<Wry>, Items)> {
    let mut builder = Builder {
        app,
        items: Items {
            commands: Vec::new(),
            open_recent: Submenu::new(app, "Open Recent", false)?,
        },
    };
    let file = builder.submenu("File", FILE)?;
    let script = builder.submenu("Script", SCRIPT)?;
    let perform = builder.submenu("Perform", PERFORM)?;
    let view = builder.submenu("View", VIEW)?;
    let settings = builder.item(Settings)?;
    let menu = Menu::with_items(
        app,
        &[
            &app_menu(app, &settings)?,
            &file,
            &edit_menu(app)?,
            &script,
            &perform,
            &view,
            &window_menu(app)?,
        ],
    )?;
    Ok((menu, builder.items))
}

struct Builder<'a> {
    app: &'a App,
    items: Items,
}

impl Builder<'_> {
    fn submenu(&mut self, title: &str, entries: &[Entry]) -> tauri::Result<Submenu<Wry>> {
        let submenu = Submenu::new(self.app, title, true)?;
        for entry in entries {
            match entry {
                Command(command) => self.item(*command)?.append_to(&submenu)?,
                Separator => submenu.append(&PredefinedMenuItem::separator(self.app)?)?,
                Entry::Submenu(title, entries) => submenu.append(&self.submenu(title, entries)?)?,
                Entry::OpenRecent => submenu.append(&self.items.open_recent)?,
            }
        }
        Ok(submenu)
    }

    /// Builds the item disabled, keeping it for `refresh` to show what it offers.
    fn item(&mut self, command: MenuCommand) -> tauri::Result<Item> {
        let (app, id, accelerator) = (self.app, command.id(), command.accelerator());
        let item = if command.is_checkable() {
            Item::Check(CheckMenuItem::with_id(
                app,
                id,
                id,
                false,
                false,
                accelerator,
            )?)
        } else {
            Item::Plain(MenuItem::with_id(app, id, id, false, accelerator)?)
        };
        self.items.commands.push((command, item.clone()));
        Ok(item)
    }
}

fn app_menu(app: &App, settings: &Item) -> tauri::Result<Submenu<Wry>> {
    let separator = || PredefinedMenuItem::separator(app);
    let menu = Submenu::with_items(
        app,
        &app.package_info().name,
        true,
        &[&PredefinedMenuItem::about(app, None, None)?, &separator()?],
    )?;
    settings.append_to(&menu)?;
    for item in [
        separator()?,
        PredefinedMenuItem::services(app, None)?,
        separator()?,
        PredefinedMenuItem::hide(app, None)?,
        PredefinedMenuItem::hide_others(app, None)?,
        separator()?,
        PredefinedMenuItem::quit(app, None)?,
    ] {
        menu.append(&item)?;
    }
    Ok(menu)
}

/// macOS routes the editor's copy, paste and undo shortcuts through these items.
fn edit_menu(app: &App) -> tauri::Result<Submenu<Wry>> {
    Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )
}

fn window_menu(app: &App) -> tauri::Result<Submenu<Wry>> {
    Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )
}
