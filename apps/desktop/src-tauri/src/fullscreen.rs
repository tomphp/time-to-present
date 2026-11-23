use std::ops::Deref;

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Monitor, WebviewWindow};
use ttp_core::perform::{DisplayArea, FullscreenMechanism, fullscreen_mechanism};

use crate::window_set::WindowSet;
use crate::{CommandResult, message};

/// The Performance windows that are fullscreen, as simple fullscreen offers no way to ask.
#[derive(Default)]
pub struct Fullscreen(WindowSet);

impl Deref for Fullscreen {
    type Target = WindowSet;

    fn deref(&self) -> &WindowSet {
        &self.0
    }
}

pub fn area(monitor: &Monitor) -> DisplayArea {
    let (width, height) = logical_size(monitor);
    DisplayArea {
        width,
        height,
        scale: monitor.scale_factor(),
    }
}

fn logical_size(monitor: &Monitor) -> (f64, f64) {
    let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
    (size.width, size.height)
}

/// Centres the window on the display at the given size, clamped to fit it.
pub fn place(
    window: &WebviewWindow,
    monitor: &Monitor,
    (width, height): (f64, f64),
) -> CommandResult<()> {
    let origin = monitor.position().to_logical::<f64>(monitor.scale_factor());
    let (area_width, area_height) = logical_size(monitor);
    let (width, height) = (width.min(area_width), height.min(area_height));
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(message)?;
    window
        .set_position(LogicalPosition::new(
            origin.x + (area_width - width) / 2.0,
            origin.y + (area_height - height) / 2.0,
        ))
        .map_err(message)
}

/// Fullscreen fills whichever display the window is on, so it is moved there first.
pub fn enter(
    app: &AppHandle,
    window: &WebviewWindow,
    monitor: &Monitor,
    size: (f64, f64),
) -> CommandResult<()> {
    leave(app, window)?;
    place(window, monitor, size)?;
    enter_in_place(app, window)
}

/// Fills the display the window is on now, remembering its frame for when it leaves.
pub fn enter_in_place(app: &AppHandle, window: &WebviewWindow) -> CommandResult<()> {
    set_fullscreen(window, true)?;
    app.state::<Fullscreen>().insert(window.label());
    Ok(())
}

/// Leaves fullscreen, keeping the window open at the size it was placed at.
pub fn leave(app: &AppHandle, window: &WebviewWindow) -> CommandResult<()> {
    set_fullscreen(window, false)?;
    app.state::<Fullscreen>().remove(window.label());
    Ok(())
}

fn set_fullscreen(window: &WebviewWindow, fullscreen: bool) -> CommandResult<()> {
    match fullscreen_mechanism(std::env::consts::OS) {
        FullscreenMechanism::Simple => window.set_simple_fullscreen(fullscreen),
        FullscreenMechanism::Regular => window.set_fullscreen(fullscreen),
    }
    .map_err(message)
}
