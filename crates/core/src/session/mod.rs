use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;

use crate::capture::{RecordingBar, RecordingBarState, Taps};
use crate::platform::Platform;
use crate::script::TimedWord;
use crate::store::{self, Presentation, StoreError};
use crate::time::Ms;

mod recording;

type Listener = Box<dyn Fn(&SessionState) + Send>;

pub struct Session {
    folder: PathBuf,
    presentation: Presentation,
    listeners: Vec<Listener>,
    platform: Platform,
    bar: Option<RecordingBar>,
    taps: Arc<Taps>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub folder: PathBuf,
    pub title: String,
    pub words: Vec<TimedWord>,
    pub script_end: Ms,
    pub recording_bar: Option<RecordingBarState>,
}

impl Session {
    pub fn create(parent: &Path, title: &str, platform: Platform) -> Result<Self, StoreError> {
        let folder = store::create(parent, title)?;
        Self::open(&folder, platform)
    }

    pub fn open(folder: &Path, platform: Platform) -> Result<Self, StoreError> {
        let presentation = store::open(folder)?;
        Ok(Self {
            folder: folder.to_path_buf(),
            presentation,
            listeners: Vec::new(),
            platform,
            bar: None,
            taps: Arc::default(),
        })
    }

    pub fn subscribe(&mut self, listener: impl Fn(&SessionState) + Send + 'static) {
        listener(&self.state());
        self.listeners.push(Box::new(listener));
    }

    pub fn rename(&mut self, title: &str) -> Result<(), StoreError> {
        let title = title.trim();
        if title.is_empty() {
            return Err(StoreError::EmptyTitle);
        }
        let mut renamed = self.presentation.clone();
        renamed.title = title.to_string();
        self.save(renamed)
    }

    pub fn state(&self) -> SessionState {
        SessionState {
            folder: self.folder.clone(),
            title: self.presentation.title.clone(),
            words: self.presentation.script.timed_words(),
            script_end: self.presentation.script.end(),
            recording_bar: self.bar.as_ref().map(RecordingBar::state),
        }
    }

    fn save(&mut self, presentation: Presentation) -> Result<(), StoreError> {
        store::save(&self.folder, &presentation)?;
        self.presentation = presentation;
        self.publish();
        Ok(())
    }

    fn publish(&self) {
        let state = self.state();
        self.listeners.iter().for_each(|listener| listener(&state));
    }
}
