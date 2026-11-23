use std::path::PathBuf;

use tauri::menu::MenuEvent;
use tauri::{AppHandle, Emitter, Manager, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use ttp_core::menu::{MenuCommand, Route};

use super::{MENU_COMMAND, OPEN_RECENT, focused_window, key_window};
use crate::{
    CommandResult, START_WINDOW, message, open_presentation, open_settings, perform, reveal,
};

/// App-level items run here; the focused window hears the rest as a menu command, which it runs
/// as its button or key would.
pub fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref();
    if let Some(folder) = id.strip_prefix(OPEN_RECENT) {
        return open(app, PathBuf::from(folder));
    }
    let Some(command) = MenuCommand::from_id(id) else {
        return;
    };
    let result = match command.route() {
        Route::Window => key_window(app).map_or(Ok(()), |label| {
            app.emit_to(label.as_str(), MENU_COMMAND, command)
                .map_err(message)
        }),
        Route::App => run(app, command),
    };
    if let Err(error) = result {
        report_failure(app, &error);
    }
}

fn run(app: &AppHandle, command: MenuCommand) -> CommandResult<()> {
    use MenuCommand::*;
    match command {
        Settings => {
            off_main_thread(app, open_settings(app.clone()));
            Ok(())
        }
        NewPresentation => show_start_window(app),
        OpenFolder => {
            pick_folder(app);
            Ok(())
        }
        Perform => {
            let handle = app.clone();
            off_main_thread(app, async move {
                perform::perform(handle.clone(), handle.state()).await
            });
            Ok(())
        }
        ToggleFullscreen => match focused_window(app) {
            Some(window) => perform::toggle_fullscreen(app.clone(), window),
            None => Ok(()),
        },
        _ => Ok(()),
    }
}

/// Runs a window-building command off the main thread, where building a window deadlocks on Windows.
fn off_main_thread(
    app: &AppHandle,
    task: impl Future<Output = CommandResult<()>> + Send + 'static,
) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = task.await {
            report_failure(&handle, &error);
        }
    });
}

fn pick_folder(app: &AppHandle) {
    let handle = app.clone();
    app.dialog()
        .file()
        .set_title("Open a Presentation folder")
        .pick_folder(
            move |folder| match folder.map(|folder| folder.into_path()) {
                Some(Ok(folder)) => open(&handle, folder),
                Some(Err(error)) => report_failure(&handle, &error.to_string()),
                None => {}
            },
        );
}

/// Opening loads the Presentation, so it runs off the main thread, as the Start Window's does.
fn open(app: &AppHandle, folder: PathBuf) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = open_presentation(&app, &app.state(), &folder) {
            report_failure(&app, &error);
        }
    });
}

fn report_failure(app: &AppHandle, error: &str) {
    log::error!("{error}");
    app.dialog()
        .message(error)
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

/// Brings up the Start Window, which asks for the new Presentation's title.
fn show_start_window(app: &AppHandle) -> CommandResult<()> {
    if let Some(start) = app.get_webview_window(START_WINDOW) {
        reveal(&start)?;
        start.set_focus().map_err(message)?;
        return start
            .emit_to(START_WINDOW, MENU_COMMAND, MenuCommand::NewPresentation)
            .map_err(message);
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == START_WINDOW)
        .ok_or("the Start Window is not configured")?;
    WebviewWindowBuilder::from_config(app, config)
        .and_then(|builder| builder.build())
        .map(drop)
        .map_err(message)
}
