use std::sync::Mutex;

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{App, AppHandle, Manager, Wry};
use ttp_core::perform::{FocusedWindow, KeyWindow, fullscreen_menu_item};

use crate::fullscreen::Fullscreen;
use crate::macos;
use crate::perform::{self, PERFORMANCE_WINDOWS};

const TOGGLE_FULLSCREEN: &str = "toggle-fullscreen";

/// View > Enter / Exit Full Screen, for the focused Performance window.
struct FullscreenItem(MenuItem<Wry>);

/// The standard App, Edit and Window menus, with a View menu that switches Performance windows in
/// place of the native Full Screen item.
pub fn install(app: &App) -> tauri::Result<()> {
    macos::leave_full_screen_out_of_the_menu();
    let offered = fullscreen_menu_item(FocusedWindow::None);
    let fullscreen = MenuItem::with_id(
        app,
        TOGGLE_FULLSCREEN,
        offered.label,
        offered.enabled,
        Some("Ctrl+Cmd+F"),
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &app_menu(app)?,
            &edit_menu(app)?,
            &Submenu::with_items(app, "View", true, &[&fullscreen])?,
            &window_menu(app)?,
        ],
    )?;
    app.set_menu(menu)?;
    app.manage(FullscreenItem(fullscreen));
    app.manage(Mutex::new(KeyWindow::default()));
    Ok(())
}

fn app_menu(app: &App) -> tauri::Result<Submenu<Wry>> {
    let separator = || PredefinedMenuItem::separator(app);
    Submenu::with_items(
        app,
        &app.package_info().name,
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &separator()?,
            &PredefinedMenuItem::services(app, None)?,
            &separator()?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &separator()?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )
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

pub fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    if event.id() != TOGGLE_FULLSCREEN {
        return;
    }
    if let Some(window) = key_window(app).and_then(|label| app.get_webview_window(&label))
        && let Err(error) = perform::toggle_fullscreen(app.clone(), window)
    {
        eprintln!("toggling full screen failed: {error}");
    }
}

pub fn focus_changed(app: &AppHandle, label: &str, focused: bool) {
    app.state::<Mutex<KeyWindow>>()
        .lock()
        .unwrap()
        .focus_changed(label, focused);
    refresh(app);
}

/// Shows what the item offers for the window with focus now.
pub fn refresh(app: &AppHandle) {
    let focused = match key_window(app) {
        None => FocusedWindow::None,
        Some(label) if PERFORMANCE_WINDOWS.contains(&label.as_str()) => {
            FocusedWindow::Performance {
                fullscreen: app.state::<Fullscreen>().contains(&label),
            }
        }
        Some(_) => FocusedWindow::Other,
    };
    let offered = fullscreen_menu_item(focused);
    let item = &app.state::<FullscreenItem>().0;
    if let Err(error) = item
        .set_enabled(offered.enabled)
        .and_then(|()| item.set_text(offered.label))
    {
        eprintln!("updating the Full Screen item failed: {error}");
    }
}

fn key_window(app: &AppHandle) -> Option<String> {
    let key_window = app.state::<Mutex<KeyWindow>>();
    key_window.lock().unwrap().label().map(str::to_string)
}
