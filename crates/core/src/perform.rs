use serde::{Deserialize, Serialize};

mod presets;
mod size;

pub use presets::{SIZE_PRESETS, Shape, SizePreset};
pub use size::{DisplayArea, FittedWindow, OutOfBounds, PixelSize, PresentationSize, fit};

/// A key pressed in the Presentation Window's page, as its injected listener reports it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageKey {
    pub key: String,
    pub meta: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub repeat: bool,
    pub composing: bool,
    pub target: KeyTarget,
}

/// The focused element the key went to.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyTarget {
    pub tag: String,
    pub input_type: Option<String>,
    pub editable: bool,
}

const INPUTS_WITHOUT_TEXT: [&str; 10] = [
    "button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit",
];

/// What a key pressed in a Performance window's page does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageKeyAction {
    /// A Performance key, for the Teleprompter's keymap.
    Forward,
    LeaveFullscreen,
    ToggleFullscreen,
    StayWithPage,
}

/// ⌃⌘F, or F11 on Windows, toggles Fullscreen wherever focus is, once per press. Otherwise the
/// page keeps ⌘- and Ctrl-combinations and anything typed into a focused text input, and Esc leaves Fullscreen.
pub fn classify(key: &PageKey) -> PageKeyAction {
    if key.composing || key.toggles_fullscreen() && key.repeat {
        PageKeyAction::StayWithPage
    } else if key.toggles_fullscreen() {
        PageKeyAction::ToggleFullscreen
    } else if key.meta || key.ctrl || key.target.takes_text() {
        PageKeyAction::StayWithPage
    } else if key.key == "Escape" {
        PageKeyAction::LeaveFullscreen
    } else {
        PageKeyAction::Forward
    }
}

impl PageKey {
    fn toggles_fullscreen(&self) -> bool {
        let unmodified = !self.alt && !self.shift;
        let control_command_f =
            self.key.eq_ignore_ascii_case("f") && self.ctrl && self.meta && unmodified;
        let f11 = self.key == "F11" && !self.ctrl && !self.meta && unmodified;
        control_command_f || f11
    }
}

impl KeyTarget {
    fn takes_text(&self) -> bool {
        self.editable
            || match self.tag.to_ascii_uppercase().as_str() {
                "TEXTAREA" | "SELECT" => true,
                "INPUT" => self.input_type.as_deref().is_none_or(|kind| {
                    !INPUTS_WITHOUT_TEXT.contains(&kind.to_ascii_lowercase().as_str())
                }),
                _ => false,
            }
    }
}

/// The two Performance windows that go fullscreen on a display of their own.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PerformanceWindow {
    Teleprompter,
    Presentation,
}

/// A connected display, known by the name macOS gives it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Display {
    pub name: String,
    pub primary: bool,
}

/// The display a window goes fullscreen on: the remembered one while it is connected, otherwise
/// the main display for the Teleprompter and another one for the Presentation.
pub fn display_for(
    window: PerformanceWindow,
    remembered: Option<&str>,
    displays: &[Display],
) -> Option<usize> {
    let named = |name: &str| displays.iter().position(|display| display.name == name);
    let main = displays.iter().position(|display| display.primary);
    let other = displays.iter().position(|display| !display.primary);
    let default = match window {
        PerformanceWindow::Teleprompter => main.or(other),
        PerformanceWindow::Presentation => other.or(main),
    };
    remembered.and_then(named).or(default)
}

/// How a Performance window fills its display.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FullscreenMechanism {
    /// macOS simple fullscreen, which stays in the current Space and needs no animation.
    Simple,
    /// The platform's own fullscreen, as simple fullscreen exists only on macOS.
    Native,
}

/// The fullscreen a Performance window uses on the given `std::env::consts::OS`.
pub fn fullscreen_mechanism(os: &str) -> FullscreenMechanism {
    if os == "macos" {
        FullscreenMechanism::Simple
    } else {
        FullscreenMechanism::Native
    }
}

/// Which windows Perform opens.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PerformanceLayout {
    #[default]
    TwoWindows,
    Combined,
    TeleprompterOnly,
}

/// How Perform lays out its windows and displays on this machine.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PerformanceSettings {
    pub layout: PerformanceLayout,
    pub teleprompter_display: Option<String>,
    pub presentation_display: Option<String>,
}
