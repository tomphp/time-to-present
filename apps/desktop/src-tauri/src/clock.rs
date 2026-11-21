use tauri::State;
use ttp_core::clock::Snapshot;
use ttp_core::session::Session;

use crate::{App, CommandResult, with_session};

#[tauri::command]
pub fn snapshot(state: State<'_, App>) -> CommandResult<Snapshot> {
    with_session(&state, |session| Ok::<_, String>(session.snapshot()))
}

#[tauri::command]
pub fn play(state: State<'_, App>) -> CommandResult<()> {
    control(&state, Session::play)
}

#[tauri::command]
pub fn pause(state: State<'_, App>) -> CommandResult<()> {
    control(&state, Session::pause)
}

#[tauri::command]
pub fn seek(state: State<'_, App>, script_time: i64) -> CommandResult<()> {
    control(&state, |session| session.seek(script_time))
}

#[tauri::command]
pub fn set_speed(state: State<'_, App>, speed: f64) -> CommandResult<()> {
    control(&state, |session| session.set_speed(speed))
}

#[tauri::command]
pub fn reset(state: State<'_, App>) -> CommandResult<()> {
    control(&state, Session::reset)
}

/// A clock command never fails on its own: only the lack of an open Presentation does.
fn control(state: &App, command: impl FnOnce(&mut Session)) -> CommandResult<()> {
    with_session(state, |session| {
        command(session);
        Ok::<_, String>(())
    })
}
