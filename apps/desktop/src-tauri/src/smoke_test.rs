use std::path::Path;
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Listener, Manager, WebviewWindow};
use ttp_core::session::Session;

use crate::{App, EDITOR_WINDOW, TELEPROMPTER_WINDOW, show};

const LOAD_TIMEOUT: Duration = Duration::from_secs(30);
const PERFORM_TIMEOUT: Duration = Duration::from_secs(30);
const CLOSE_TIMEOUT: Duration = Duration::from_secs(10);
const RETRY_INTERVAL: Duration = Duration::from_millis(250);
const PAGE_LOADED: &str =
    "document.readyState === 'complete' ? Promise.resolve() : new Promise(() => {})";

/// Performs from the Editor of a new Presentation, as the presenter would, then exits 0 if the
/// Teleprompter answers and closes, else 1. A frozen main thread answers nothing, so it fails too.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let parent = std::env::temp_dir().join(format!("ttp-smoke-test-{}", std::process::id()));
        let result = run(&app, &parent);
        let _ = std::fs::remove_dir_all(&parent);
        let code = match result {
            Ok(()) => {
                log::info!("smoke test passed");
                0
            }
            Err(error) => {
                log::error!("smoke test failed: {error}");
                1
            }
        };
        std::process::exit(code);
    });
}

fn run(app: &AppHandle, parent: &Path) -> Result<(), String> {
    let editor = open_presentation(app, parent)?;
    wait_until_loaded(&editor)?;
    ask(&editor, "perform", "invoke('perform')", PERFORM_TIMEOUT)?;
    let teleprompter = app
        .get_webview_window(TELEPROMPTER_WINDOW)
        .ok_or("Perform opened no Teleprompter")?;
    wait_until_loaded(&teleprompter)?;
    close(app, &teleprompter)
}

fn open_presentation(app: &AppHandle, parent: &Path) -> Result<WebviewWindow, String> {
    let state = app.state::<App>();
    std::fs::create_dir_all(parent).map_err(text)?;
    let session = Session::create(parent, "Smoke test", state.platform.clone()).map_err(text)?;
    show(app, &state, session).map_err(|error| error.to_string())?;
    app.get_webview_window(EDITOR_WINDOW)
        .ok_or_else(|| "opening a Presentation opened no Editor".into())
}

/// Asks until the page has loaded, as a script run before then is lost.
fn wait_until_loaded(window: &WebviewWindow) -> Result<(), String> {
    let event = format!("smoke-test-loaded-{}", window.label());
    let answers = listen(window.app_handle(), &event);
    let loaded = retry_until(LOAD_TIMEOUT, || {
        window.eval(answering(&event, PAGE_LOADED)).map_err(text)?;
        Ok(answers.recv_timeout(RETRY_INTERVAL).is_ok())
    })?;
    loaded.then_some(()).ok_or_else(|| {
        format!(
            "the {} window did not answer within {LOAD_TIMEOUT:?}",
            window.label()
        )
    })
}

fn ask(window: &WebviewWindow, name: &str, call: &str, timeout: Duration) -> Result<(), String> {
    let event = format!("smoke-test-{name}");
    let answers = listen(window.app_handle(), &event);
    window.eval(answering(&event, call)).map_err(text)?;
    match answers.recv_timeout(timeout) {
        Ok(answer) if answer == "null" => Ok(()),
        Ok(error) => Err(format!("{name} failed: {error}")),
        Err(_) => Err(format!("{name} did not answer within {timeout:?}")),
    }
}

fn close(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    window.close().map_err(text)?;
    let closed = retry_until(CLOSE_TIMEOUT, || {
        std::thread::sleep(RETRY_INTERVAL);
        Ok(app.get_webview_window(window.label()).is_none())
    })?;
    closed.then_some(()).ok_or_else(|| {
        format!(
            "the {} window did not close within {CLOSE_TIMEOUT:?}",
            window.label()
        )
    })
}

/// Whether `attempt` succeeded before `timeout`; each attempt waits a `RETRY_INTERVAL` itself.
fn retry_until(
    timeout: Duration,
    mut attempt: impl FnMut() -> Result<bool, String>,
) -> Result<bool, String> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if attempt()? {
            return Ok(true);
        }
    }
    Ok(false)
}

fn text(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn listen(app: &AppHandle, event: &str) -> Receiver<String> {
    let (sender, receiver) = mpsc::channel();
    app.listen(event, move |answer| {
        let _ = sender.send(answer.payload().to_string());
    });
    receiver
}

/// A script that runs `call`, a promise, and emits `event` with null or the error it failed with.
fn answering(event: &str, call: &str) -> String {
    format!(
        "window.__TAURI_INTERNALS__ && (() => {{
            const {{ invoke }} = window.__TAURI_INTERNALS__;
            const answer = (error) => invoke('plugin:event|emit', {{ event: '{event}', payload: error }});
            ({call}).then(() => answer(null), (error) => answer(String(error)));
        }})()"
    )
}
