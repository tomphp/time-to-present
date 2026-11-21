use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use ttp_core::clip;
use ttp_core::clock::TICK_INTERVAL;
use ttp_core::models::{InstalledModel, ModelManager, Progress, whisper_catalog};
use ttp_core::platform::Platform;
use ttp_core::script::{Edit, EditError};
use ttp_core::session::{Session, SessionState};
use ttp_core::settings::Settings;
use ttp_core::store::StoreError;
use ttp_core::time::MonotonicTime;
use ttp_core::transcription::{SidecarLiveTranscriber, SidecarTranscriber};
use ttp_core::waveform::{self, Waveform};
use ttp_server::{Server, ServerStatus, SharedSession};

mod audio;
mod clock;
mod displays;
mod fullscreen;
mod macos;
mod perform;
mod recording;
mod window_set;

const POLL_INTERVAL: Duration = Duration::from_millis(TICK_INTERVAL as u64);
const SIDECAR: &str = "ttp-stt-sidecar";

const SESSION_STATE: &str = "session-state";
const SESSION_EVENT: &str = "session-event";
const START_WINDOW: &str = "start";
const EDITOR_WINDOW: &str = "editor";
const SETTINGS_WINDOW: &str = "settings";
const TELEPROMPTER_WINDOW: &str = "teleprompter";
const MODEL_PROGRESS: &str = "model-progress";
const RECORDING_METER: &str = "recording-meter";
const SERVER_STATUS: &str = "server-status";

struct App {
    platform: Platform,
    session: SharedSession,
    server: Server,
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
    let renamed = with_session(&state, |session| {
        session.rename(&title)?;
        Ok::<_, StoreError>(session.state())
    })?;
    set_editor_title(&app, &renamed.title);
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
    bring_up_window(&app, SETTINGS_WINDOW, "Settings", (480.0, 360.0))?
        .set_focus()
        .map_err(message)
}

/// Brings an open window to the front, or opens the `<label>.html` page in a new one.
fn reveal(window: &WebviewWindow) -> CommandResult<()> {
    window.unminimize().map_err(message)?;
    window.show().map_err(message)
}

fn bring_up_window(
    app: &AppHandle,
    label: &str,
    title: &str,
    (width, height): (f64, f64),
) -> CommandResult<WebviewWindow> {
    if let Some(window) = app.get_webview_window(label) {
        reveal(&window)?;
        return Ok(window);
    }
    let builder =
        WebviewWindowBuilder::new(app, label, WebviewUrl::App(format!("{label}.html").into()))
            .title(title)
            .inner_size(width, height);
    let builder = if label == TELEPROMPTER_WINDOW {
        builder.initialization_script_for_all_frames(perform::FORWARD_APP_PANE_KEYS)
    } else {
        builder
    };
    builder.build().map_err(message)
}

#[tauri::command]
fn session_state(state: State<'_, App>) -> Option<SessionState> {
    state.session.lock().unwrap().as_ref().map(Session::state)
}

#[tauri::command]
fn server_status(state: State<'_, App>) -> ServerStatus {
    state.server.status()
}

#[tauri::command]
fn open_in_browser(state: State<'_, App>) -> CommandResult<()> {
    let url = state.server.status().url;
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map(drop)
        .map_err(message)
}

#[tauri::command]
fn edit(state: State<'_, App>, edit: Edit) -> CommandResult<SessionState> {
    with_session(&state, |session| {
        session.edit(edit)?;
        Ok::<_, EditError>(session.state())
    })
}

#[tauri::command]
fn cut(state: State<'_, App>, words: Vec<String>) -> CommandResult<SessionState> {
    with_session(&state, |session| {
        session.cut(&words)?;
        Ok::<_, EditError>(session.state())
    })
}

#[tauri::command]
fn copy(state: State<'_, App>, words: Vec<String>) -> CommandResult<()> {
    with_session(&state, |session| session.copy(&words))
}

#[tauri::command]
fn paste(
    state: State<'_, App>,
    after: Option<String>,
    replacing: Vec<String>,
    text: String,
) -> CommandResult<SessionState> {
    with_session(&state, |session| {
        session.paste(after, &replacing, &text)?;
        Ok::<_, EditError>(session.state())
    })
}

#[tauri::command]
fn drag(state: State<'_, App>, drag: String, edit: Edit) -> CommandResult<SessionState> {
    with_session(&state, |session| {
        session.drag(&drag, edit)?;
        Ok::<_, EditError>(session.state())
    })
}

#[tauri::command]
fn nudge(state: State<'_, App>, run: String, edit: Edit) -> CommandResult<SessionState> {
    with_session(&state, |session| {
        session.nudge(&run, edit)?;
        Ok::<_, EditError>(session.state())
    })
}

#[tauri::command]
async fn recording_waveform(state: State<'_, App>, recording: String) -> CommandResult<Waveform> {
    let file = recording_file(&state, &recording)?;
    tauri::async_runtime::spawn_blocking(move || waveform::read(&file))
        .await
        .map_err(message)?
        .map_err(message)
}

/// The Recording's audio from `from` to `until` in Recording Time, as WAV bytes.
#[tauri::command]
async fn recording_clip(
    state: State<'_, App>,
    recording: String,
    from: i64,
    until: i64,
) -> CommandResult<Response> {
    let file = recording_file(&state, &recording)?;
    tauri::async_runtime::spawn_blocking(move || clip::read(&file, from, until))
        .await
        .map_err(message)?
        .map(Response::new)
        .map_err(message)
}

fn recording_file(state: &App, recording: &str) -> CommandResult<PathBuf> {
    with_session(state, |session| {
        session
            .recording_file(recording)
            .ok_or(format!("no Recording with id {recording}"))
    })
}

#[tauri::command]
fn undo(state: State<'_, App>) -> CommandResult<SessionState> {
    with_session(&state, |session| {
        session.undo()?;
        Ok::<_, EditError>(session.state())
    })
}

#[tauri::command]
fn redo(state: State<'_, App>) -> CommandResult<SessionState> {
    with_session(&state, |session| {
        session.redo()?;
        Ok::<_, EditError>(session.state())
    })
}

#[tauri::command]
fn select_event(state: State<'_, App>, event: String) -> CommandResult<SessionState> {
    with_session(&state, |session| {
        session.select_event(&event);
        Ok::<_, String>(session.state())
    })
}

/// Runs a command on the open Session, which there must be.
fn with_session<T, E: std::fmt::Display>(
    state: &App,
    command: impl FnOnce(&mut Session) -> Result<T, E>,
) -> CommandResult<T> {
    let mut guard = state.session.lock().unwrap();
    let session = guard.as_mut().ok_or("no Presentation is open")?;
    command(session).map_err(message)
}

/// Runs a save on the Session if one is open, and reports a failure without stopping.
fn save_open_session(
    app: &AppHandle,
    what: &str,
    save: impl FnOnce(&mut Session) -> Result<(), StoreError>,
) {
    if let Some(session) = app.state::<App>().session.lock().unwrap().as_mut()
        && let Err(error) = save(session)
    {
        eprintln!("{what} failed: {error}");
    }
}

/// Runs the clock, follows the Live Transcript, lands Transcriptions and autosaves, as the
/// Session asks to be polled regularly.
fn poll_session(app: AppHandle) {
    loop {
        std::thread::sleep(POLL_INTERVAL);
        save_open_session(&app, "polling the Session", Session::poll);
    }
}

/// Tells the windows how the server stands whenever a Presentation App connects or leaves.
async fn watch_server(app: AppHandle) {
    let mut connected = app.state::<App>().server.watch_connected_apps();
    while connected.changed().await.is_ok() {
        emit_server_status(&app);
    }
}

fn emit_server_status(app: &AppHandle) {
    let _ = app.emit(SERVER_STATUS, app.state::<App>().server.status());
}

/// Tauri puts the `externalBin` sidecar next to the app's own executable.
fn sidecar_path() -> Result<PathBuf, std::io::Error> {
    let executable = std::env::current_exe()?;
    Ok(executable.with_file_name(SIDECAR))
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
    let streaming = app.clone();
    session.subscribe_stream(move |event| {
        let _ = streaming.emit(SESSION_EVENT, event);
    });
    let opened = session.state();
    if let Err(error) = state.settings.lock().unwrap().add_recent(&opened.folder) {
        eprintln!("could not update the Recent list: {error}");
    }
    if let Err(error) = state.server.open(session) {
        eprintln!("saving the previous Presentation failed: {error}");
    }
    emit_server_status(app);
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
            let session = SharedSession::default();
            let server =
                tauri::async_runtime::block_on(Server::start(settings.server(), session.clone()))?;
            let models = Arc::new(ModelManager::new(
                app.path().app_data_dir()?.join("models"),
                whisper_catalog(),
            ));
            app.manage(App {
                platform: Platform {
                    time: Arc::new(MonotonicTime::new()),
                    audio: Arc::new(audio::CpalSource::new()),
                    app_nap: Arc::new(macos::ProcessActivity),
                    transcriber: Arc::new(SidecarTranscriber::new(sidecar_path()?, models.clone())),
                    live: Arc::new(SidecarLiveTranscriber::new(sidecar_path()?, models.clone())),
                },
                session,
                server,
                settings: Mutex::new(settings),
                models,
            });
            app.manage(fullscreen::Fullscreen::default());
            app.manage(perform::FocusedPerformanceWindows::default());
            let handle = app.handle().clone();
            std::thread::spawn(move || poll_session(handle));
            tauri::async_runtime::spawn(watch_server(app.handle().clone()));
            Ok(())
        })
        .on_window_event(perform::on_window_event)
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
            server_status,
            open_in_browser,
            edit,
            cut,
            copy,
            paste,
            drag,
            nudge,
            recording_waveform,
            recording_clip,
            undo,
            redo,
            select_event,
            recording::open_recording_bar,
            recording::select_input,
            recording::select_channel,
            recording::close_recording_bar,
            recording::start_recording,
            recording::start_re_recording,
            recording::stop_recording,
            recording::cancel_recording,
            recording::retry_transcription,
            recording::discard_transcription,
            recording::remove_unused_recordings,
            clock::snapshot,
            clock::play,
            clock::preview,
            clock::pause,
            clock::seek,
            clock::set_speed,
            clock::reset,
            perform::approach_cue,
            perform::set_approach_cue,
            perform::perform,
            displays::displays,
            perform::performance_settings,
            perform::set_performance_settings,
            perform::leave_fullscreen,
            perform::forward_key
        ])
        .build(tauri::generate_context!())
        .expect("error while building Time to Present")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event
                && let Err(error) = app.state::<App>().server.close()
            {
                eprintln!("saving on exit failed: {error}");
            }
        });
}
