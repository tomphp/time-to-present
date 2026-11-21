use tauri::{AppHandle, Monitor};
use ttp_core::perform::{Display, PerformanceWindow, display_for};

use crate::{CommandResult, message};

#[tauri::command]
pub fn displays(app: AppHandle) -> CommandResult<Vec<Display>> {
    let primary = app.primary_monitor().map_err(message)?;
    let monitors = app.available_monitors().map_err(message)?;
    Ok(monitors
        .iter()
        .map(|monitor| display(monitor, primary.as_ref()))
        .collect())
}

/// The monitor the window goes fullscreen on, if any is connected.
pub fn monitor_for(
    app: &AppHandle,
    window: PerformanceWindow,
    remembered: Option<&str>,
) -> CommandResult<Option<Monitor>> {
    let primary = app.primary_monitor().map_err(message)?;
    let mut monitors = app.available_monitors().map_err(message)?;
    let displays: Vec<_> = monitors
        .iter()
        .map(|monitor| display(monitor, primary.as_ref()))
        .collect();
    Ok(display_for(window, remembered, &displays).map(|index| monitors.swap_remove(index)))
}

fn display(monitor: &Monitor, primary: Option<&Monitor>) -> Display {
    Display {
        name: name(monitor),
        primary: primary.is_some_and(|primary| name(primary) == name(monitor)),
    }
}

fn name(monitor: &Monitor) -> String {
    monitor.name().cloned().unwrap_or_else(|| {
        let position = monitor.position();
        format!("Display at {},{}", position.x, position.y)
    })
}
