use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use ttp_core::session::{Session, SessionState};
use ttp_core::settings::Settings;
use ttp_core::time::{MonotonicTime, TimeSource};

const SESSION_STATE: &str = "session-state";
const START_WINDOW: &str = "start";
const EDITOR_WINDOW: &str = "editor";

struct App {
    time: Arc<dyn TimeSource>,
    session: Mutex<Option<Session>>,
    settings: Mutex<Settings>,
}

#[derive(Serialize)]
struct Recent {
    folders: Vec<PathBuf>,
    dropped: Vec<PathBuf>,
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
    let session = Session::open(&folder, state.time.clone()).map_err(|error| {
        if !folder.is_dir() {
            if let Err(error) = state.settings.lock().unwrap().forget_recent(&folder) {
                eprintln!("could not update the Recent list: {error}");
            }
            return format!(
                "{} no longer exists, so it was removed from Recent",
                folder.display()
            );
        }
        message(error)
    })?;
    show(&app, &state, session)
}

#[tauri::command]
fn recent_presentations(state: State<'_, App>) -> CommandResult<Recent> {
    let mut settings = state.settings.lock().unwrap();
    let dropped = settings.drop_missing().map_err(message)?;
    Ok(Recent {
        folders: settings.recent().to_vec(),
        dropped,
    })
}

#[tauri::command]
fn rename_presentation(app: AppHandle, state: State<'_, App>, title: String) -> CommandResult<()> {
    let mut guard = state.session.lock().unwrap();
    let session = guard.as_mut().ok_or("no Presentation is open")?;
    session.rename(&title).map_err(message)?;
    set_editor_title(&app, &session.state().title);
    Ok(())
}

#[tauri::command]
fn session_state(state: State<'_, App>) -> Option<SessionState> {
    state.session.lock().unwrap().as_ref().map(Session::state)
}

fn show(app: &AppHandle, state: &App, mut session: Session) -> CommandResult<SessionState> {
    let publisher = app.clone();
    session.subscribe(move |published| {
        let _ = publisher.emit(SESSION_STATE, published);
    });
    let opened = session.state();
    if let Err(error) = state.settings.lock().unwrap().add_recent(&opened.folder) {
        eprintln!("could not update the Recent list: {error}");
    }
    *state.session.lock().unwrap() = Some(session);
    if app.get_webview_window(EDITOR_WINDOW).is_none() {
        WebviewWindowBuilder::new(app, EDITOR_WINDOW, WebviewUrl::App("editor.html".into()))
            .title(&opened.title)
            .inner_size(900.0, 700.0)
            .build()
            .map_err(message)?;
    } else {
        set_editor_title(app, &opened.title);
    }
    if let Some(start) = app.get_webview_window(START_WINDOW) {
        start.close().map_err(message)?;
    }
    Ok(opened)
}

fn set_editor_title(app: &AppHandle, title: &str) {
    if let Some(editor) = app.get_webview_window(EDITOR_WINDOW) {
        let _ = editor.set_title(title);
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let settings = Settings::load(app.path().app_config_dir()?.join("settings.json"));
            app.manage(App {
                time: Arc::new(MonotonicTime::new()),
                session: Mutex::default(),
                settings: Mutex::new(settings),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            new_presentation,
            open_folder,
            recent_presentations,
            rename_presentation,
            session_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running Time to Present");
}
