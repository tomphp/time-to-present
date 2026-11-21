use tauri::{
    AppHandle, Emitter, Manager, Monitor, State, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, Window, WindowEvent,
};
use ttp_core::perform::{
    PageKey, PerformanceLayout, PerformanceSettings, PerformanceWindow, forwards,
};
use ttp_core::settings::ApproachCue;

use crate::displays::monitor_for;
use crate::fullscreen::{self, Fullscreen, logical_size, place};
use crate::window_set::WindowSet;
use crate::{App, CommandResult, TELEPROMPTER_WINDOW, bring_up_window, message, with_session};

const PRESENTATION_WINDOW: &str = "presentation";
const APPROACH_CUE: &str = "approach-cue";
const PERFORMANCE_KEY: &str = "performance-key";
const APP_FOCUS: &str = "app-focus";
const TELEPROMPTER_SIZE: (f64, f64) = (900.0, 700.0);
const FORWARD_KEYS: &str = include_str!("forward-keys.js");
const PERFORMANCE_WINDOWS: [&str; 2] = [TELEPROMPTER_WINDOW, PRESENTATION_WINDOW];

/// The Performance windows that have focus, so keys reach the Performance while any one does.
#[derive(Default)]
pub struct Focused(WindowSet);

/// Opens the remembered Performance Layout, each window simple-fullscreen on its display. With only
/// one display, the Presentation Window stays a window at its size, as for sharing it on a call.
#[tauri::command]
pub fn perform(app: AppHandle, state: State<'_, App>) -> CommandResult<()> {
    let performance = state.settings.lock().unwrap().performance().clone();
    let teleprompter =
        bring_up_window(&app, TELEPROMPTER_WINDOW, "Teleprompter", TELEPROMPTER_SIZE)?;
    let remembered = performance.teleprompter_display.as_deref();
    let teleprompter_monitor = monitor_for(&app, PerformanceWindow::Teleprompter, remembered)?;
    if let Some(monitor) = &teleprompter_monitor {
        fullscreen::enter(&app, &teleprompter, monitor, TELEPROMPTER_SIZE)?;
    }
    match performance.layout {
        PerformanceLayout::TwoWindows => {
            show_presentation(&app, &state, &performance, teleprompter_monitor)?
        }
        PerformanceLayout::TeleprompterOnly => {
            if let Some(presentation) = app.get_webview_window(PRESENTATION_WINDOW) {
                presentation.close().map_err(message)?;
            }
        }
    }
    teleprompter.set_focus().map_err(message)
}

#[tauri::command]
pub fn performance_settings(state: State<'_, App>) -> PerformanceSettings {
    state.settings.lock().unwrap().performance().clone()
}

/// Remembers how to Perform, resizing a Presentation Window that is not fullscreen to the new size.
#[tauri::command]
pub fn set_performance_settings(
    app: AppHandle,
    state: State<'_, App>,
    performance: PerformanceSettings,
) -> CommandResult<()> {
    let size = performance.presentation_size;
    state
        .settings
        .lock()
        .unwrap()
        .set_performance(performance)
        .map_err(message)?;
    let Some(presentation) = app.get_webview_window(PRESENTATION_WINDOW) else {
        return Ok(());
    };
    if app.state::<Fullscreen>().0.contains(presentation.label()) {
        return Ok(());
    }
    if let Some(monitor) = presentation.current_monitor().map_err(message)? {
        place(&presentation, &monitor, size.within(logical_size(&monitor)))?;
    }
    Ok(())
}

/// Esc: the calling window leaves fullscreen and stays open.
#[tauri::command]
pub fn leave_fullscreen(app: AppHandle, window: WebviewWindow) -> CommandResult<()> {
    fullscreen::leave(&app, &window)
}

/// A key pressed in the Presentation Window's page. Performance keys go on to the Teleprompter,
/// which runs the keymap, except Esc, which takes the Presentation Window out of fullscreen.
#[tauri::command]
pub fn forward_key(app: AppHandle, window: WebviewWindow, key: PageKey) -> CommandResult<()> {
    if !forwards(&key) {
        return Ok(());
    }
    if key.key == "Escape" {
        return fullscreen::leave(&app, &window);
    }
    app.emit_to(TELEPROMPTER_WINDOW, PERFORMANCE_KEY, key)
        .map_err(message)
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::Focused(focused) => tell_teleprompter_of_focus(window, *focused),
        WindowEvent::Destroyed => {
            window.state::<Fullscreen>().0.remove(window.label());
            tell_teleprompter_of_focus(window, false);
            if window.label() == TELEPROMPTER_WINDOW {
                pause_unseen_performance(window);
            }
        }
        _ => {}
    }
}

fn tell_teleprompter_of_focus(window: &Window, focused: bool) {
    if !PERFORMANCE_WINDOWS.contains(&window.label()) {
        return;
    }
    let windows = &window.state::<Focused>().0;
    if focused {
        windows.insert(window.label());
    } else {
        windows.remove(window.label());
    }
    let _ = window.emit_to(TELEPROMPTER_WINDOW, APP_FOCUS, !windows.is_empty());
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
fn pause_unseen_performance(window: &Window) {
    let _no_presentation_to_pause = with_session(&window.state::<App>(), |session| {
        session.pause();
        Ok::<_, String>(())
    });
}

/// Fullscreen on its own display, or a window at its size when it would cover the Teleprompter.
fn show_presentation(
    app: &AppHandle,
    state: &App,
    performance: &PerformanceSettings,
    teleprompter_monitor: Option<Monitor>,
) -> CommandResult<()> {
    let remembered = performance.presentation_display.as_deref();
    let Some(monitor) = monitor_for(app, PerformanceWindow::Presentation, remembered)? else {
        return Ok(());
    };
    let size = performance.presentation_size.within(logical_size(&monitor));
    let presentation = presentation_window(app, state, size)?;
    if teleprompter_monitor.is_some_and(|shared| shared.position() == monitor.position()) {
        fullscreen::leave(app, &presentation)?;
        place(&presentation, &monitor, size)
    } else {
        fullscreen::enter(app, &presentation, &monitor, size)
    }
}

/// The chrome-less window showing the Presentation App, never mirrored, its keys forwarded.
fn presentation_window(
    app: &AppHandle,
    state: &App,
    (width, height): (f64, f64),
) -> CommandResult<WebviewWindow> {
    let url = Url::parse(&state.server.status().url).map_err(message)?;
    if let Some(window) = app.get_webview_window(PRESENTATION_WINDOW) {
        window.unminimize().map_err(message)?;
        window.show().map_err(message)?;
        if window.url().map_err(message)?.origin() != url.origin() {
            window.navigate(url).map_err(message)?;
        }
        return Ok(window);
    }
    WebviewWindowBuilder::new(app, PRESENTATION_WINDOW, WebviewUrl::External(url))
        .title("Presentation")
        .decorations(false)
        .inner_size(width, height)
        .initialization_script(FORWARD_KEYS)
        .build()
        .map_err(message)
}
