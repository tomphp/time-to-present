use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use ttp_core::models::{InstalledModel, ModelManager, Progress, whisper_catalog};
use ttp_core::platform::Platform;
use ttp_core::session::{Session, SessionState};
use ttp_core::settings::Settings;
use ttp_core::time::MonotonicTime;

mod audio;
mod macos;
mod recording;

const SESSION_STATE: &str = "session-state";
const START_WINDOW: &str = "start";
const EDITOR_WINDOW: &str = "editor";
const SETTINGS_WINDOW: &str = "settings";
const MODEL_PROGRESS: &str = "model-progress";
const RECORDING_METER: &str = "recording-meter";

struct App {
    platform: Platform,
    session: Mutex<Option<Session>>,
    settings: Mutex<Settings>,
    models: Arc<ModelManager>,
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
    let session = Session::create(&parent, &title, state.platform.clone()).map_err(message)?;
    show(&app, &state, session)
}

#[tauri::command]
async fn open_folder(
    app: AppHandle,
    state: State<'_, App>,
    folder: PathBuf,
) -> CommandResult<SessionState> {
    let session = Session::open(&folder, state.platform.clone()).map_err(|error| {
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

#[derive(Clone, Serialize)]
struct ModelProgress {
    name: String,
    #[serde(flatten)]
    progress: Progress,
}

#[tauri::command]
async fn ensure_model(app: AppHandle, state: State<'_, App>, name: String) -> CommandResult<()> {
    let models = state.models.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut last_percent = None;
        models
            .ensure(&name, |progress| {
                let percent = progress
                    .total
                    .map(|total| progress.downloaded * 100 / total.max(1));
                if percent.is_none() || percent != last_percent {
                    last_percent = percent;
                    let _ = app.emit(
                        MODEL_PROGRESS,
                        ModelProgress {
                            name: name.clone(),
                            progress,
                        },
                    );
                }
            })
            .map(drop)
    })
    .await
    .map_err(message)?
    .map_err(message)
}

#[tauri::command]
fn installed_models(state: State<'_, App>) -> CommandResult<Vec<InstalledModel>> {
    state.models.installed().map_err(message)
}

#[tauri::command]
fn remove_model(state: State<'_, App>, name: String) -> CommandResult<()> {
    state.models.remove(&name).map_err(message)
}

#[tauri::command]
fn open_settings(app: AppHandle) -> CommandResult<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW) {
        return window.set_focus().map_err(message);
    }
    WebviewWindowBuilder::new(
        &app,
        SETTINGS_WINDOW,
        WebviewUrl::App("settings.html".into()),
    )
    .title("Settings")
    .inner_size(480.0, 360.0)
    .build()
    .map(drop)
    .map_err(message)
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
    let metering = app.clone();
    session.subscribe_meter(move |meter| {
        let _ = metering.emit(RECORDING_METER, meter);
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
                platform: Platform {
                    time: Arc::new(MonotonicTime::new()),
                    audio: Arc::new(audio::CpalSource::new()),
                    app_nap: Arc::new(macos::ProcessActivity),
                },
                session: Mutex::default(),
                settings: Mutex::new(settings),
                models: Arc::new(ModelManager::new(
                    app.path().app_data_dir()?.join("models"),
                    whisper_catalog(),
                )),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            new_presentation,
            open_folder,
            recent_presentations,
            rename_presentation,
            ensure_model,
            installed_models,
            remove_model,
            open_settings,
            session_state,
            recording::open_recording_bar,
            recording::select_input,
            recording::select_channel,
            recording::close_recording_bar,
            recording::start_recording,
            recording::stop_recording,
            recording::cancel_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running Time to Present");
}
