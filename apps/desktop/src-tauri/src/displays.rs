use tauri::{AppHandle, Monitor};
use ttp_core::perform::{Display, PerformanceWindow, display_for};

use crate::{CommandResult, message};

#[tauri::command]
pub fn displays(app: AppHandle) -> CommandResult<Vec<Display>> {
    Ok(connected(&app)?.1)
}

/// The monitor the window goes fullscreen on, if any is connected.
pub fn monitor_for(
    app: &AppHandle,
    window: PerformanceWindow,
    remembered: Option<&str>,
) -> CommandResult<Option<Monitor>> {
    let (mut monitors, displays) = connected(app)?;
    Ok(display_for(window, remembered, &displays).map(|index| monitors.swap_remove(index)))
}

/// The connected monitors, each with the Display the core chooses between.
fn connected(app: &AppHandle) -> CommandResult<(Vec<Monitor>, Vec<Display>)> {
    let primary = app.primary_monitor().map_err(message)?;
    let monitors = app.available_monitors().map_err(message)?;
    let displays = monitors
        .iter()
        .map(|monitor| display(monitor, primary.as_ref()))
        .collect();
    Ok((monitors, displays))
}

fn display(monitor: &Monitor, primary: Option<&Monitor>) -> Display {
    Display {
        name: display_name(monitor),
        primary: primary.is_some_and(|primary| display_name(primary) == display_name(monitor)),
    }
}

pub fn display_name(monitor: &Monitor) -> String {
    monitor.name().cloned().unwrap_or_else(|| {
        let position = monitor.position();
        format!("Display at {},{}", position.x, position.y)
    })
}
