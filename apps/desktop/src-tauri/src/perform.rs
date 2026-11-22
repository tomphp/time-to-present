use std::ops::Deref;

use tauri::{
    AppHandle, Emitter, Manager, Monitor, State, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, Window, WindowEvent,
};
use ttp_core::perform::{
    PageKey, PageKeyAction, PerformanceLayout, PerformanceSettings, PerformanceWindow,
    PresentationSize, SIZE_PRESETS, SizePreset, classify, fit,
};
use ttp_core::settings::ApproachCue;

use crate::displays::monitor_for;
use crate::fullscreen::{self, Fullscreen, area, place};
use crate::menu;
use crate::window_set::WindowSet;
use crate::{
    App, CommandResult, TELEPROMPTER_WINDOW, bring_up_window, message, reveal, with_session,
};

const PRESENTATION_WINDOW: &str = "presentation";
const APPROACH_CUE: &str = "approach-cue";
const PERFORMANCE_KEY: &str = "performance-key";
const PERFORMANCE_SETTINGS: &str = "performance-settings";
const APP_FOCUS: &str = "app-focus";
const FULLSCREEN_CHANGED: &str = "fullscreen-changed";
const TELEPROMPTER_SIZE: (f64, f64) = (900.0, 700.0);
const FORWARD_KEYS: &str = include_str!("forward-keys.js");
/// Injected into the Teleprompter Window's frames only, to forward keys pressed in the app pane.
pub const FORWARD_APP_PANE_KEYS: &str = concat!(
    "window.forwardFromFramesOnly = true;\n",
    include_str!("forward-keys.js")
);
pub const PERFORMANCE_WINDOWS: [&str; 2] = [TELEPROMPTER_WINDOW, PRESENTATION_WINDOW];

/// The Performance windows that have focus, so keys reach the Performance while any one does.
#[derive(Default)]
pub struct FocusedPerformanceWindows(WindowSet);

impl Deref for FocusedPerformanceWindows {
    type Target = WindowSet;

    fn deref(&self) -> &WindowSet {
        &self.0
    }
}

/// Opens the remembered Performance Layout, the Teleprompter simple-fullscreen on its display and the
/// Presentation Window at the open Presentation's Presentation Size.
#[tauri::command]
pub fn perform(app: AppHandle, state: State<'_, App>) -> CommandResult<()> {
    let size = with_session(&state, |session| {
        Ok::<_, String>(session.presentation_size())
    })?;
    let performance = state.settings.lock().unwrap().performance().clone();
    let teleprompter =
        bring_up_window(&app, TELEPROMPTER_WINDOW, "Teleprompter", TELEPROMPTER_SIZE)?;
    let remembered = performance.teleprompter_display.as_deref();
    let teleprompter_monitor = monitor_for(&app, PerformanceWindow::Teleprompter, remembered)?;
    if let Some(monitor) = &teleprompter_monitor {
        fullscreen::enter(&app, &teleprompter, monitor, TELEPROMPTER_SIZE)?;
        fullscreen_changed(&teleprompter, true)?;
    }
    match performance.layout {
        PerformanceLayout::TwoWindows => {
            show_presentation(&app, &state, &performance, size, teleprompter_monitor)?
        }
        PerformanceLayout::Combined | PerformanceLayout::TeleprompterOnly => {
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

/// Remembers how to Perform on this machine.
#[tauri::command]
pub fn set_performance_settings(
    app: AppHandle,
    state: State<'_, App>,
    performance: PerformanceSettings,
) -> CommandResult<()> {
    state
        .settings
        .lock()
        .unwrap()
        .set_performance(performance.clone())
        .map_err(message)?;
    app.emit(PERFORMANCE_SETTINGS, performance).map_err(message)
}

/// Saves the Presentation Size in the open Presentation, resizing a Presentation Window that is not
/// fullscreen to it.
#[tauri::command]
pub fn set_presentation_size(
    app: AppHandle,
    state: State<'_, App>,
    size: PresentationSize,
) -> CommandResult<()> {
    with_session(&state, |session| session.set_presentation_size(size))?;
    let Some(presentation) = app.get_webview_window(PRESENTATION_WINDOW) else {
        return Ok(());
    };
    if app.state::<Fullscreen>().contains(presentation.label()) {
        return Ok(());
    }
    if let Some(monitor) = presentation.current_monitor().map_err(message)? {
        place(&presentation, &monitor, fit(size, area(&monitor)).points)?;
    }
    Ok(())
}

#[tauri::command]
pub fn size_presets() -> &'static [SizePreset] {
    SIZE_PRESETS
}

/// Esc: the calling window leaves Fullscreen and stays open.
#[tauri::command]
pub fn leave_fullscreen(app: AppHandle, window: WebviewWindow) -> CommandResult<()> {
    set_fullscreen(&app, &window, false)
}

/// ⌃⌘F: the calling window switches between Fullscreen and Windowed.
#[tauri::command]
pub fn toggle_fullscreen(app: AppHandle, window: WebviewWindow) -> CommandResult<()> {
    let is_fullscreen = app.state::<Fullscreen>().contains(window.label());
    set_fullscreen(&app, &window, !is_fullscreen)
}

/// A key pressed in the Presentation Window's page, or in the app pane of the Combined layout.
/// Performance keys go on to the Teleprompter, which runs the keymap; Esc and ⌃⌘F act on the
/// calling window.
#[tauri::command]
pub fn forward_key(app: AppHandle, window: WebviewWindow, key: PageKey) -> CommandResult<()> {
    match classify(&key) {
        PageKeyAction::Forward => app
            .emit_to(TELEPROMPTER_WINDOW, PERFORMANCE_KEY, key)
            .map_err(message),
        PageKeyAction::LeaveFullscreen => leave_fullscreen(app, window),
        PageKeyAction::ToggleFullscreen => toggle_fullscreen(app, window),
        PageKeyAction::StayWithPage => Ok(()),
    }
}

/// Switches a Performance window between Fullscreen, on the display it is on now, and Windowed, back
/// at the frame it had. Perform's own placement is left to `perform`.
fn set_fullscreen(app: &AppHandle, window: &WebviewWindow, fullscreen: bool) -> CommandResult<()> {
    let unchanged = app.state::<Fullscreen>().contains(window.label()) == fullscreen;
    if unchanged || !PERFORMANCE_WINDOWS.contains(&window.label()) {
        return Ok(());
    }
    if fullscreen {
        set_title_bar(window, false)?;
        fullscreen::enter_in_place(app, window)?;
    } else {
        fullscreen::leave(app, window)?;
        set_title_bar(window, true)?;
    }
    fullscreen_changed(window, fullscreen)
}

/// The Presentation Window has a title bar only while Windowed, outside the shared content, so its
/// inner size is put back should the platform change it.
fn set_title_bar(window: &WebviewWindow, shown: bool) -> CommandResult<()> {
    if window.label() != PRESENTATION_WINDOW {
        return Ok(());
    }
    let scale = window.scale_factor().map_err(message)?;
    let inner = window.inner_size().map_err(message)?;
    window.set_decorations(shown).map_err(message)?;
    if window.inner_size().map_err(message)? != inner {
        window
            .set_size(inner.to_logical::<f64>(scale))
            .map_err(message)?;
    }
    Ok(())
}

fn fullscreen_changed(window: &WebviewWindow, fullscreen: bool) -> CommandResult<()> {
    menu::refresh(window.app_handle());
    window
        .emit_to(window.label(), FULLSCREEN_CHANGED, fullscreen)
        .map_err(message)
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::Focused(focused) => {
            tell_teleprompter_of_focus(window, *focused);
            menu::focus_changed(window.app_handle(), window.label(), *focused);
        }
        WindowEvent::Destroyed => {
            window.state::<Fullscreen>().remove(window.label());
            tell_teleprompter_of_focus(window, false);
            menu::focus_changed(window.app_handle(), window.label(), false);
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
    let windows = window.state::<FocusedPerformanceWindows>();
    if focused {
        windows.insert(window.label());
    } else {
        windows.remove(window.label());
    }
    let _ = window.emit_to(TELEPROMPTER_WINDOW, APP_FOCUS, !windows.is_empty());
}

/// Whether the calling window is Fullscreen, for a page that loaded after the change was announced.
#[tauri::command]
pub fn is_fullscreen(window: WebviewWindow, state: State<'_, Fullscreen>) -> bool {
    state.contains(window.label())
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

/// A centred window at its Presentation Size, or for Fill display fullscreen on a display of its
/// own and the largest 16:9 window on one it shares with the Teleprompter.
fn show_presentation(
    app: &AppHandle,
    state: &App,
    performance: &PerformanceSettings,
    size: PresentationSize,
    teleprompter_monitor: Option<Monitor>,
) -> CommandResult<()> {
    let remembered = performance.presentation_display.as_deref();
    let Some(monitor) = monitor_for(app, PerformanceWindow::Presentation, remembered)? else {
        return Ok(());
    };
    let window = fit(size, area(&monitor));
    let presentation = presentation_window(app, state, window.points)?;
    let shared = teleprompter_monitor.is_some_and(|shared| shared.position() == monitor.position());
    let fullscreen = window.fullscreen_on_own_display && !shared;
    if fullscreen {
        set_title_bar(&presentation, false)?;
        fullscreen::enter(app, &presentation, &monitor, window.points)?;
    } else {
        fullscreen::leave(app, &presentation)?;
        set_title_bar(&presentation, true)?;
        place(&presentation, &monitor, window.points)?;
    }
    fullscreen_changed(&presentation, fullscreen)
}

/// The window showing the Presentation App, never mirrored, its keys forwarded.
fn presentation_window(
    app: &AppHandle,
    state: &App,
    (width, height): (f64, f64),
) -> CommandResult<WebviewWindow> {
    let url = Url::parse(&state.server.status().url).map_err(message)?;
    if let Some(window) = app.get_webview_window(PRESENTATION_WINDOW) {
        reveal(&window)?;
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
