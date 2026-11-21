use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};

use crate::{App, CommandResult, message};

const TELEPROMPTER_WINDOW: &str = "teleprompter";

#[tauri::command]
pub fn open_teleprompter(app: AppHandle) -> CommandResult<()> {
    if let Some(window) = app.get_webview_window(TELEPROMPTER_WINDOW) {
        return window.set_focus().map_err(message);
    }
    WebviewWindowBuilder::new(
        &app,
        TELEPROMPTER_WINDOW,
        WebviewUrl::App("teleprompter.html".into()),
    )
    .title("Teleprompter")
    .inner_size(900.0, 700.0)
    .build()
    .map(drop)
    .map_err(message)
}

/// Closing the Teleprompter pauses a playing clock, so the Performance never runs on unseen.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != TELEPROMPTER_WINDOW || !matches!(event, WindowEvent::Destroyed) {
        return;
    }
    if let Some(session) = window.state::<App>().session.lock().unwrap().as_mut() {
        session.pause();
    }
}
