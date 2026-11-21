use tauri::{AppHandle, Emitter, Manager, State, Window, WindowEvent};
use ttp_core::settings::ApproachCue;

use crate::{App, CommandResult, TELEPROMPTER_WINDOW, bring_up_window, message, with_session};

const APPROACH_CUE: &str = "approach-cue";

#[tauri::command]
pub fn open_teleprompter(app: AppHandle) -> CommandResult<()> {
    bring_up_window(&app, TELEPROMPTER_WINDOW, "Teleprompter", (900.0, 700.0))
}

#[tauri::command]
pub fn approach_cue(state: State<'_, App>) -> ApproachCue {
    state.settings.lock().unwrap().approach_cue()
}

#[tauri::command]
pub fn set_approach_cue(
    app: AppHandle,
    state: State<'_, App>,
    cue: ApproachCue,
) -> CommandResult<()> {
    state
        .settings
        .lock()
        .unwrap()
        .set_approach_cue(cue)
        .map_err(message)?;
    app.emit(APPROACH_CUE, cue).map_err(message)
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
