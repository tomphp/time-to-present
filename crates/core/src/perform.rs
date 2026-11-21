use serde::{Deserialize, Serialize};

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

/// Whether a key pressed in the Presentation Window goes on to the core as a Performance key.
/// The page keeps ⌘-combinations and anything typed into a focused text input.
pub fn forwards(key: &PageKey) -> bool {
    !key.meta && !key.composing && !key.target.takes_text()
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

/// How large the Presentation Window is while it is not fullscreen.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum PresentationSize {
    #[serde(rename = "1280x720")]
    Hd720,
    #[default]
    #[serde(rename = "1920x1080")]
    Hd1080,
    #[serde(rename = "fit")]
    Fit,
}

impl PresentationSize {
    /// The window's size in points on a display of the given size, never larger than it fits at 16:9.
    pub fn within(self, (width, height): (f64, f64)) -> (f64, f64) {
        let fit = if width * 9.0 > height * 16.0 {
            ((height * 16.0 / 9.0).floor(), height)
        } else {
            (width, (width * 9.0 / 16.0).floor())
        };
        match self {
            Self::Hd720 if fit.0 >= 1280.0 => (1280.0, 720.0),
            Self::Hd1080 if fit.0 >= 1920.0 => (1920.0, 1080.0),
            _ => fit,
        }
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
    pub presentation_size: PresentationSize,
}
