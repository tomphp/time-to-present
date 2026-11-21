use tauri::{AppHandle, Manager, Window, WindowEvent};

use crate::{App, CommandResult, TELEPROMPTER_WINDOW, bring_up_window, with_session};

#[tauri::command]
pub fn open_teleprompter(app: AppHandle) -> CommandResult<()> {
    bring_up_window(&app, TELEPROMPTER_WINDOW, "Teleprompter", (900.0, 700.0))
}

/// Closing the Teleprompter pauses a playing clock, so the Performance never runs on unseen.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != TELEPROMPTER_WINDOW || !matches!(event, WindowEvent::Destroyed) {
        return;
    }
    let _no_presentation_to_pause = with_session(&window.state::<App>(), |session| {
        session.pause();
        Ok::<_, String>(())
    });
}
