use std::collections::HashMap;
use std::sync::Mutex;

use tauri::menu::MenuItem;
use tauri::{App, AppHandle, Manager, WebviewWindow};
use ttp_core::menu::{FocusedWindow, KeyWindow, MenuContext, WindowReport, menu_item};

use crate::fullscreen::Fullscreen;
use crate::perform::PRESENTATION_WINDOW;
use crate::{App as AppState, EDITOR_WINDOW, TELEPROMPTER_WINDOW, macos};
use layout::Items;

mod layout;
mod route;

pub use route::on_menu_event;

pub const MENU_COMMAND: &str = "menu-command";
const OPEN_RECENT: &str = "open-recent:";

/// What each window last reported, by label.
#[derive(Default)]
struct Reports(Mutex<HashMap<String, WindowReport>>);

/// The menu bar: the app's commands, each with its shortcut, around the standard Edit and Window
/// menus, with View > Full Screen switching Performance windows in place of the native item.
pub fn install(app: &App) -> tauri::Result<()> {
    macos::leave_full_screen_out_of_the_menu();
    let (menu, items) = layout::menu_bar(app)?;
    app.set_menu(menu)?;
    app.manage(items);
    app.manage(Mutex::new(KeyWindow::default()));
    app.manage(Reports::default());
    refresh(app.handle());
    recent_changed(app.handle());
    Ok(())
}

/// Keeps what a window reported for the menu and shows it while that window has focus.
#[tauri::command]
pub fn report_menu_state(app: AppHandle, window: WebviewWindow, report: WindowReport) {
    let reports = app.state::<Reports>();
    reports
        .0
        .lock()
        .unwrap()
        .insert(window.label().to_string(), report);
    refresh(&app);
}

pub fn focus_changed(app: &AppHandle, label: &str, focused: bool) {
    app.state::<Mutex<KeyWindow>>()
        .lock()
        .unwrap()
        .focus_changed(label, focused);
    refresh(app);
}

pub fn window_destroyed(app: &AppHandle, label: &str) {
    app.state::<Reports>().0.lock().unwrap().remove(label);
    focus_changed(app, label, false);
}

/// Shows what each item offers for the window with focus now.
pub fn refresh(app: &AppHandle) {
    let context = context(app);
    for (command, item) in &app.state::<Items>().commands {
        if let Err(error) = item.show(menu_item(*command, &context)) {
            eprintln!("updating the {} item failed: {error}", command.id());
        }
    }
}

/// Lists the Recent Presentations under File > Open Recent.
pub fn recent_changed(app: &AppHandle) {
    let folders = app
        .state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .recent()
        .to_vec();
    let submenu = &app.state::<Items>().open_recent;
    let listed = (|| {
        while submenu.remove_at(0)?.is_some() {}
        for folder in &folders {
            let id = format!("{OPEN_RECENT}{}", folder.display());
            let name = folder.file_name().unwrap_or(folder.as_os_str());
            submenu.append(&MenuItem::with_id(
                app,
                id,
                name.to_string_lossy(),
                true,
                None::<&str>,
            )?)?;
        }
        submenu.set_enabled(!folders.is_empty())
    })();
    if let Err(error) = listed {
        eprintln!("updating Open Recent failed: {error}");
    }
}

fn context(app: &AppHandle) -> MenuContext {
    let state = app.state::<AppState>();
    let presentation_open = state.session.lock().unwrap().is_some();
    let layout = state.settings.lock().unwrap().performance().layout;
    MenuContext {
        focused: focused(app),
        presentation_open,
        layout,
    }
}

fn focused(app: &AppHandle) -> FocusedWindow {
    let Some(label) = key_window(app) else {
        return FocusedWindow::None;
    };
    let report = app
        .state::<Reports>()
        .0
        .lock()
        .unwrap()
        .get(&label)
        .copied();
    let fullscreen = app.state::<Fullscreen>().contains(&label);
    match (label.as_str(), report) {
        (EDITOR_WINDOW, Some(WindowReport::Editor(report))) => FocusedWindow::Editor(Some(report)),
        (EDITOR_WINDOW, _) => FocusedWindow::Editor(None),
        (TELEPROMPTER_WINDOW, report) => FocusedWindow::Teleprompter {
            fullscreen,
            report: match report {
                Some(WindowReport::Teleprompter(report)) => Some(report),
                _ => None,
            },
        },
        (PRESENTATION_WINDOW, _) => FocusedWindow::Presentation { fullscreen },
        _ => FocusedWindow::Other,
    }
}

fn focused_window(app: &AppHandle) -> Option<WebviewWindow> {
    key_window(app).and_then(|label| app.get_webview_window(&label))
}

fn key_window(app: &AppHandle) -> Option<String> {
    let key_window = app.state::<Mutex<KeyWindow>>();
    key_window.lock().unwrap().label().map(str::to_string)
}
