use serde::{Deserialize, Serialize};

mod command;

pub use command::{MenuCommand, Route};

use crate::clock::ClockState;
use crate::perform::PerformanceLayout;

/// The state an Editor window reports for the menu.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorReport {
    pub recording: bool,
    /// Words are selected, so a Recording would Re-record them.
    pub selection: bool,
    pub listenable: bool,
    pub locked: bool,
    pub clock: Option<ClockState>,
    pub inspector_shown: bool,
    pub timeline_shown: bool,
}

/// The display options a Teleprompter Window reports for the menu.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeleprompterReport {
    pub blanked: bool,
    pub markers: bool,
    pub mirrored: bool,
    pub flipped: bool,
}

/// The last report a window made, for the shell to keep by window label.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "window", rename_all = "camelCase")]
pub enum WindowReport {
    Editor(EditorReport),
    Teleprompter(TeleprompterReport),
}

/// The window that has focus, with what it last reported.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FocusedWindow {
    None,
    Other,
    Editor(Option<EditorReport>),
    Teleprompter {
        fullscreen: bool,
        report: Option<TeleprompterReport>,
    },
    Presentation {
        fullscreen: bool,
    },
}

/// The window with focus, by label, followed whichever order the platform reports the change in.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct KeyWindow(Option<String>);

impl KeyWindow {
    pub fn label(&self) -> Option<&str> {
        self.0.as_deref()
    }

    pub fn focus_changed(&mut self, label: &str, focused: bool) {
        if focused {
            self.0 = Some(label.to_string());
        } else if self.label() == Some(label) {
            self.0 = None;
        }
    }
}

/// Everything the menu bar's items depend on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MenuContext {
    pub focused: FocusedWindow,
    pub presentation_open: bool,
    pub layout: PerformanceLayout,
}

/// What a menu item offers now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MenuItemState {
    pub enabled: bool,
    pub label: &'static str,
    pub checked: bool,
}

/// Each item is enabled only where its command works, and shows the state the focused window reported.
pub fn menu_item(command: MenuCommand, context: &MenuContext) -> MenuItemState {
    MenuItemState {
        enabled: enabled(command, context),
        label: label(command, context),
        checked: checked(command, context),
    }
}

fn enabled(command: MenuCommand, context: &MenuContext) -> bool {
    use MenuCommand::*;
    match (command, context.focused) {
        (Settings | NewPresentation | OpenFolder, _) => true,
        (Perform, _) => context.presentation_open,
        (ToggleFullscreen, focused) => fullscreen(focused).is_some(),
        (_, FocusedWindow::Editor(Some(editor))) => editor_enables(command, editor),
        (
            _,
            FocusedWindow::Teleprompter {
                report: Some(_), ..
            },
        ) => command.is_teleprompter_option(),
        _ => false,
    }
}

/// The Edit lock refuses Script edits while the clock plays or a Recording is under way, but a
/// Recording can still start.
fn editor_enables(command: MenuCommand, editor: EditorReport) -> bool {
    use MenuCommand::*;
    let editable = !editor.locked;
    match command {
        Record => true,
        ReRecordSelection => editor.selection && !editor.recording,
        Retime => editor.selection && editable,
        AddNamedEvent | PlayFromCursor => editable,
        Listen => editor.listenable,
        PlayPause => matches!(
            editor.clock,
            Some(ClockState::Ready | ClockState::Paused | ClockState::Playing)
        ),
        Restart => editor.clock == Some(ClockState::Ended),
        RemoveUnusedRecordings
        | LayoutTwoWindows
        | LayoutCombined
        | LayoutTeleprompterOnly
        | ToggleInspector
        | ToggleTimeline => true,
        _ => false,
    }
}

fn fullscreen(focused: FocusedWindow) -> Option<bool> {
    match focused {
        FocusedWindow::Teleprompter { fullscreen, .. }
        | FocusedWindow::Presentation { fullscreen } => Some(fullscreen),
        _ => None,
    }
}

fn checked(command: MenuCommand, context: &MenuContext) -> bool {
    if let Some(layout) = command.layout() {
        return layout == context.layout;
    }
    let FocusedWindow::Teleprompter {
        report: Some(report),
        ..
    } = context.focused
    else {
        return false;
    };
    match command {
        MenuCommand::Blank => report.blanked,
        MenuCommand::Markers => report.markers,
        MenuCommand::Mirror => report.mirrored,
        MenuCommand::Flip => report.flipped,
        _ => false,
    }
}

fn label(command: MenuCommand, context: &MenuContext) -> &'static str {
    use MenuCommand::*;
    let editor = match context.focused {
        FocusedWindow::Editor(report) => report,
        _ => None,
    };
    let reported = |shows: fn(EditorReport) -> bool| editor.is_some_and(shows);
    match command {
        Settings => "Settings…",
        NewPresentation => "New Presentation…",
        OpenFolder => "Open Folder…",
        RemoveUnusedRecordings => "Remove Unused Recordings",
        Record if reported(|editor| editor.recording) => "Stop",
        Record => "Record",
        ReRecordSelection => "Re-record Selection",
        AddNamedEvent => "Add Named Event",
        Retime => "Retime…",
        Listen => "Listen",
        Perform => "Perform",
        LayoutTwoWindows => "Two windows",
        LayoutCombined => "Combined",
        LayoutTeleprompterOnly => "Teleprompter only",
        PlayPause if reported(|editor| editor.clock == Some(ClockState::Playing)) => "Pause",
        PlayPause => "Play",
        PlayFromCursor => "Play from Cursor",
        Restart => "Restart",
        ToggleFullscreen if fullscreen(context.focused) == Some(true) => "Exit Full Screen",
        ToggleFullscreen => "Enter Full Screen",
        ToggleInspector if reported(|editor| !editor.inspector_shown) => "Show Inspector",
        ToggleInspector => "Hide Inspector",
        ToggleTimeline if reported(|editor| !editor.timeline_shown) => "Show Timeline",
        ToggleTimeline => "Hide Timeline",
        Blank => "Blank Screen (B / .)",
        Markers => "Show Named Event Markers (E)",
        Mirror => "Mirror (M)",
        Flip => "Flip (⇧M)",
        FontLarger => "Larger Text (⌘+)",
        FontSmaller => "Smaller Text (⌘−)",
        ReadingLineUp => "Raise Reading Line (⌘↑)",
        ReadingLineDown => "Lower Reading Line (⌘↓)",
    }
}
