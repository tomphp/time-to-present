use tauri::State;
use ttp_core::capture::{CaptureError, InputChoice};
use ttp_core::session::{InsertionPoint, Session};

use crate::{App, CommandResult, message, with_session};

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
        Ok::<_, CaptureError>(())
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
pub fn start_recording(state: State<'_, App>, at: InsertionPoint) -> CommandResult<()> {
    with_session(&state, |session| session.start_recording(at))
}

#[tauri::command]
pub fn start_re_recording(state: State<'_, App>, words: Vec<String>) -> CommandResult<()> {
    with_session(&state, |session| session.start_re_recording(&words))
}

#[tauri::command]
pub fn stop_recording(state: State<'_, App>) -> CommandResult<()> {
    with_session(&state, |session| session.stop_recording().map(drop))
}

#[tauri::command]
pub fn cancel_recording(state: State<'_, App>) -> CommandResult<()> {
    with_session(&state, Session::cancel_recording)
}

#[tauri::command]
pub fn retry_transcription(state: State<'_, App>, recording: String) -> CommandResult<()> {
    with_session(&state, |session| session.retry_transcription(&recording))
}

#[tauri::command]
pub fn remove_unused_recordings(state: State<'_, App>) -> CommandResult<()> {
    with_session(&state, Session::remove_unused_recordings)
}

#[tauri::command]
pub fn discard_transcription(state: State<'_, App>, recording: String) -> CommandResult<()> {
    with_session(&state, |session| session.discard_transcription(&recording))
}
