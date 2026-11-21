use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use ttp_core::session::{Session, SessionState};
use ttp_core::time::{MonotonicTime, TimeSource};

const SESSION_STATE: &str = "session-state";
const START_WINDOW: &str = "start";
const EDITOR_WINDOW: &str = "editor";

struct App {
    time: Arc<dyn TimeSource>,
    session: Mutex<Option<Session>>,
}

type CommandResult<T> = Result<T, String>;

fn message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[tauri::command]
async fn new_presentation(
    app: AppHandle,
    state: State<'_, App>,
    parent: PathBuf,
    title: String,
) -> CommandResult<SessionState> {
    let session = Session::create(&parent, &title, state.time.clone()).map_err(message)?;
    show(&app, &state, session)
}

#[tauri::command]
async fn open_folder(
    app: AppHandle,
    state: State<'_, App>,
    folder: PathBuf,
) -> CommandResult<SessionState> {
    let session = Session::open(&folder, state.time.clone()).map_err(message)?;
    show(&app, &state, session)
}

#[tauri::command]
fn session_state(state: State<'_, App>) -> Option<SessionState> {
    state.session.lock().unwrap().as_ref().map(Session::state)
}

fn show(app: &AppHandle, state: &App, session: Session) -> CommandResult<SessionState> {
    let published = session.state();
    *state.session.lock().unwrap() = Some(session);
    app.emit(SESSION_STATE, &published).map_err(message)?;
    if app.get_webview_window(EDITOR_WINDOW).is_none() {
        WebviewWindowBuilder::new(app, EDITOR_WINDOW, WebviewUrl::App("editor.html".into()))
            .title(&published.title)
            .inner_size(900.0, 700.0)
            .build()
            .map_err(message)?;
    }
    if let Some(start) = app.get_webview_window(START_WINDOW) {
        start.close().map_err(message)?;
    }
    Ok(published)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(App {
            time: Arc::new(MonotonicTime::new()),
            session: Mutex::default(),
        })
        .invoke_handler(tauri::generate_handler![
            new_presentation,
            open_folder,
            session_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running Time to Present");
}
