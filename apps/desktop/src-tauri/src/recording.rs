use tauri::State;
use ttp_core::capture::{CaptureError, InputChoice};
use ttp_core::session::Session;

use crate::{App, CommandResult, message};

fn with_session<T>(
    state: &App,
    act: impl FnOnce(&mut Session) -> Result<T, CaptureError>,
) -> CommandResult<T> {
    let mut guard = state.session.lock().unwrap();
    let session = guard.as_mut().ok_or("no Presentation is open")?;
    act(session).map_err(message)
}

#[tauri::command]
pub async fn open_recording_bar(state: State<'_, App>) -> CommandResult<()> {
    // The first time, this waits on the presenter's answer, so it runs outside the Session lock.
    let audio = state.platform.audio.clone();
    tauri::async_runtime::spawn_blocking(move || audio.request_access())
        .await
        .map_err(message)?;
    let choice = state.settings.lock().unwrap().input().clone();
    with_session(&state, |session| {
        session.open_recording_bar(choice);
        Ok(())
    })
}

#[tauri::command]
pub fn select_input(state: State<'_, App>, choice: InputChoice) -> CommandResult<()> {
    with_session(&state, |session| session.select_input(choice.clone()))?;
    state
        .settings
        .lock()
        .unwrap()
        .set_input(choice)
        .map_err(message)
}

/// Keeps the remembered device even while it is missing and the bar has fallen back.
#[tauri::command]
pub fn select_channel(state: State<'_, App>, channel: u16) -> CommandResult<()> {
    let remembered = state.settings.lock().unwrap().input().clone();
    select_input(
        state,
        InputChoice {
            channel,
            ..remembered
        },
    )
}

#[tauri::command]
pub fn close_recording_bar(state: State<'_, App>) -> CommandResult<()> {
    with_session(&state, Session::close_recording_bar)
}

#[tauri::command]
pub fn start_recording(state: State<'_, App>) -> CommandResult<()> {
    with_session(&state, Session::start_recording)
}

#[tauri::command]
pub fn stop_recording(state: State<'_, App>) -> CommandResult<()> {
    with_session(&state, |session| session.stop_recording().map(drop))
}

#[tauri::command]
pub fn cancel_recording(state: State<'_, App>) -> CommandResult<()> {
    with_session(&state, Session::cancel_recording)
}
