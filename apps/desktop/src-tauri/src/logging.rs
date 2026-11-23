use std::ops::Deref;

use log::LevelFilter;
use tauri::ipc::InvokeError;
use tauri::plugin::TauriPlugin;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use ttp_core::diagnostics::{command_failed, panicked};

const LOG_FILE: &str = "time-to-present";
const MAX_LOG_BYTES: u128 = 1_000_000;

/// Logs to the app's log directory, and to the console where there is one.
pub fn plugin() -> TauriPlugin<tauri::Wry> {
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir {
                file_name: Some(LOG_FILE.into()),
            }),
        ])
        .level(LevelFilter::Info)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .max_file_size(MAX_LOG_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(2))
        .build()
}

/// Logs panics as well as reporting them as before.
pub fn log_panics() {
    let report = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("{}", panicked(info.payload(), info.location()));
        report(info);
    }));
}

/// An error a command returns, logged as it goes back to the window that invoked it.
#[derive(Debug)]
pub struct CommandError(String);

impl<E: std::fmt::Display> From<E> for CommandError {
    fn from(error: E) -> Self {
        Self(error.to_string())
    }
}

impl Deref for CommandError {
    type Target = str;

    fn deref(&self) -> &str {
        &self.0
    }
}

impl From<CommandError> for InvokeError {
    fn from(error: CommandError) -> Self {
        log::error!("{}", command_failed(&error));
        InvokeError::from(error.0)
    }
}
