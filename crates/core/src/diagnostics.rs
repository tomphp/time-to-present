//! What the app writes to its log file, so a failure leaves a trace in builds without a console.

use std::any::Any;
use std::fmt;
use std::panic::Location;

use crate::perform::PerformanceWindow;

pub fn command_failed(error: &str) -> String {
    format!("a command failed: {error}")
}

/// A panic's message, which is a `&str` or a `String` unless the code panicked with another value.
pub fn panicked(payload: &dyn Any, location: Option<&Location>) -> String {
    let message = payload
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
        .unwrap_or("(no message)");
    match location {
        Some(location) => format!(
            "panicked at {}:{}:{}: {message}",
            location.file(),
            location.line(),
            location.column()
        ),
        None => format!("panicked: {message}"),
    }
}

/// A step of Perform, logged as it starts so a hang shows where Perform stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PerformStep {
    BringUpWindow(PerformanceWindow),
    ChooseDisplay(PerformanceWindow),
    EnterFullscreen(PerformanceWindow),
    LeaveFullscreen(PerformanceWindow),
    PlaceWindow(PerformanceWindow),
    Focus(PerformanceWindow),
    ShowWindow(PerformanceWindow),
    CloseWindow(PerformanceWindow),
}

impl fmt::Display for PerformStep {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BringUpWindow(window) => write!(f, "bringing up the {}", name(*window)),
            Self::ChooseDisplay(window) => write!(f, "choosing the {}'s display", name(*window)),
            Self::EnterFullscreen(window) => {
                write!(f, "entering fullscreen on the {}", name(*window))
            }
            Self::LeaveFullscreen(window) => {
                write!(f, "leaving fullscreen on the {}", name(*window))
            }
            Self::PlaceWindow(window) => write!(f, "placing the {}", name(*window)),
            Self::Focus(window) => write!(f, "focusing the {}", name(*window)),
            Self::ShowWindow(window) => write!(f, "showing the {}", name(*window)),
            Self::CloseWindow(window) => write!(f, "closing the {}", name(*window)),
        }
    }
}

pub fn step_started(step: PerformStep) -> String {
    format!("Perform: {step}")
}

pub fn step_failed(step: PerformStep, error: &str) -> String {
    format!("Perform failed while {step}: {error}")
}

pub fn display_chosen(window: PerformanceWindow, display: Option<&str>) -> String {
    match display {
        Some(display) => format!("Perform: the {} goes on {display}", name(window)),
        None => format!("Perform: no display is connected for the {}", name(window)),
    }
}

pub fn fullscreen_switched(window: &str, fullscreen: bool) -> String {
    let now = if fullscreen { "fullscreen" } else { "windowed" };
    format!("the {window} window goes {now}")
}

fn name(window: PerformanceWindow) -> &'static str {
    match window {
        PerformanceWindow::Teleprompter => "Teleprompter Window",
        PerformanceWindow::Presentation => "Presentation Window",
    }
}
