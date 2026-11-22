use std::sync::Mutex;

use tauri::menu::{AboutMetadata, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{App, AppHandle, Manager, Wry};
use ttp_core::perform::{FocusedWindow, fullscreen_menu_item};

use crate::fullscreen::Fullscreen;
use crate::macos;
use crate::perform::{self, PERFORMANCE_WINDOWS};

const TOGGLE_FULLSCREEN: &str = "toggle-fullscreen";

/// View > Enter / Exit Full Screen, for the focused Performance window.
struct FullscreenItem(MenuItem<Wry>);

/// The window with focus, by label.
#[derive(Default)]
struct KeyWindow(Mutex<Option<String>>);

impl KeyWindow {
    fn label(&self) -> Option<String> {
        self.0.lock().unwrap().clone()
    }

    /// Follows focus as it moves between windows, whichever order macOS reports the change in.
    fn focus_changed(&self, label: &str, focused: bool) {
        let mut key_window = self.0.lock().unwrap();
        if focused {
            *key_window = Some(label.to_string());
        } else if key_window.as_deref() == Some(label) {
            *key_window = None;
        }
    }
}

/// The standard App, Edit and Window menus, with a View menu that switches Performance windows in
/// place of the native Full Screen item.
pub fn install(app: &App) -> tauri::Result<()> {
    macos::leave_full_screen_out_of_the_menu();
    let fullscreen = MenuItem::with_id(
        app,
        TOGGLE_FULLSCREEN,
        "Enter Full Screen",
        false,
        Some("Ctrl+Cmd+F"),
    )?;
    let info = app.package_info();
    let about = AboutMetadata {
        name: Some(info.name.clone()),
        version: Some(info.version.to_string()),
        ..AboutMetadata::default()
    };
    let menu = Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                &info.name,
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(about))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
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
            )?,
            &Submenu::with_items(app, "View", true, &[&fullscreen])?,
            &Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?,
        ],
    )?;
    app.set_menu(menu)?;
    app.manage(FullscreenItem(fullscreen));
    app.manage(KeyWindow::default());
    Ok(())
}

pub fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    if event.id() != TOGGLE_FULLSCREEN {
        return;
    }
    let focused = app.state::<KeyWindow>().label();
    if let Some(window) = focused.and_then(|label| app.get_webview_window(&label))
        && let Err(error) = perform::toggle_fullscreen(app.clone(), window)
    {
        eprintln!("toggling full screen failed: {error}");
    }
}

pub fn focus_changed(app: &AppHandle, label: &str, focused: bool) {
    app.state::<KeyWindow>().focus_changed(label, focused);
    refresh(app);
}

/// Shows what the item offers for the window with focus now.
pub fn refresh(app: &AppHandle) {
    let focused = match app.state::<KeyWindow>().label().as_deref() {
        None => FocusedWindow::None,
        Some(label) if PERFORMANCE_WINDOWS.contains(&label) => FocusedWindow::Performance {
            fullscreen: app.state::<Fullscreen>().contains(label),
        },
        Some(_) => FocusedWindow::Other,
    };
    let offered = fullscreen_menu_item(focused);
    let item = &app.state::<FullscreenItem>().0;
    let _ = item.set_enabled(offered.enabled);
    let _ = item.set_text(offered.label);
}
