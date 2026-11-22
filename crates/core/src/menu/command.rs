use serde::{Serialize, Serializer};

use crate::perform::PerformanceLayout;

/// Every command the menu bar lists beyond the ones macOS provides and the Open Recent entries.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuCommand {
    Settings,
    NewPresentation,
    OpenFolder,
    RemoveUnusedRecordings,
    Record,
    ReRecordSelection,
    AddNamedEvent,
    DeleteNamedEvent,
    Retime,
    Listen,
    Perform,
    LayoutTwoWindows,
    LayoutCombined,
    LayoutTeleprompterOnly,
    PlayPause,
    PlayFromCursor,
    Restart,
    ToggleFullscreen,
    ToggleInspector,
    ToggleTimeline,
    Blank,
    Markers,
    Mirror,
    Flip,
    FontLarger,
    FontSmaller,
    ReadingLineUp,
    ReadingLineDown,
}

/// Whether the shell runs a command itself or hands it to the focused window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    App,
    Window,
}

impl MenuCommand {
    pub const ALL: [MenuCommand; 28] = [
        Self::Settings,
        Self::NewPresentation,
        Self::OpenFolder,
        Self::RemoveUnusedRecordings,
        Self::Record,
        Self::ReRecordSelection,
        Self::AddNamedEvent,
        Self::DeleteNamedEvent,
        Self::Retime,
        Self::Listen,
        Self::Perform,
        Self::LayoutTwoWindows,
        Self::LayoutCombined,
        Self::LayoutTeleprompterOnly,
        Self::PlayPause,
        Self::PlayFromCursor,
        Self::Restart,
        Self::ToggleFullscreen,
        Self::ToggleInspector,
        Self::ToggleTimeline,
        Self::Blank,
        Self::Markers,
        Self::Mirror,
        Self::Flip,
        Self::FontLarger,
        Self::FontSmaller,
        Self::ReadingLineUp,
        Self::ReadingLineDown,
    ];

    pub fn route(self) -> Route {
        match self {
            Self::Settings
            | Self::NewPresentation
            | Self::OpenFolder
            | Self::Perform
            | Self::ToggleFullscreen => Route::App,
            _ => Route::Window,
        }
    }

    /// The item's id, and the name a window hears the command by.
    pub fn id(self) -> &'static str {
        match self {
            Self::Settings => "settings",
            Self::NewPresentation => "newPresentation",
            Self::OpenFolder => "openFolder",
            Self::RemoveUnusedRecordings => "removeUnusedRecordings",
            Self::Record => "record",
            Self::ReRecordSelection => "reRecordSelection",
            Self::AddNamedEvent => "addNamedEvent",
            Self::DeleteNamedEvent => "deleteNamedEvent",
            Self::Retime => "retime",
            Self::Listen => "listen",
            Self::Perform => "perform",
            Self::LayoutTwoWindows => "layoutTwoWindows",
            Self::LayoutCombined => "layoutCombined",
            Self::LayoutTeleprompterOnly => "layoutTeleprompterOnly",
            Self::PlayPause => "playPause",
            Self::PlayFromCursor => "playFromCursor",
            Self::Restart => "restart",
            Self::ToggleFullscreen => "toggleFullscreen",
            Self::ToggleInspector => "toggleInspector",
            Self::ToggleTimeline => "toggleTimeline",
            Self::Blank => "blank",
            Self::Markers => "markers",
            Self::Mirror => "mirror",
            Self::Flip => "flip",
            Self::FontLarger => "fontLarger",
            Self::FontSmaller => "fontSmaller",
            Self::ReadingLineUp => "readingLineUp",
            Self::ReadingLineDown => "readingLineDown",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|command| command.id() == id)
    }

    /// The modifier shortcuts that work from anywhere today. The Teleprompter's display keys stay
    /// with its window, so the Editor keeps its caret keys, and ⌘E and ⌘⌫ stay with the Editor.
    pub fn accelerator(self) -> Option<&'static str> {
        match self {
            Self::Settings => Some("Cmd+,"),
            Self::Record => Some("Cmd+R"),
            Self::Perform => Some("Shift+Cmd+P"),
            Self::ToggleFullscreen => Some("Ctrl+Cmd+F"),
            _ => None,
        }
    }

    /// Whether the item shows a check mark.
    pub fn is_checkable(self) -> bool {
        self.layout().is_some()
            || matches!(
                self,
                Self::Blank | Self::Markers | Self::Mirror | Self::Flip
            )
    }

    pub(super) fn layout(self) -> Option<PerformanceLayout> {
        match self {
            Self::LayoutTwoWindows => Some(PerformanceLayout::TwoWindows),
            Self::LayoutCombined => Some(PerformanceLayout::Combined),
            Self::LayoutTeleprompterOnly => Some(PerformanceLayout::TeleprompterOnly),
            _ => None,
        }
    }

    pub(super) fn is_teleprompter_option(self) -> bool {
        matches!(
            self,
            Self::Blank
                | Self::Markers
                | Self::Mirror
                | Self::Flip
                | Self::FontLarger
                | Self::FontSmaller
                | Self::ReadingLineUp
                | Self::ReadingLineDown
        )
    }
}

impl Serialize for MenuCommand {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.id())
    }
}
