use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;

use crate::script::TimedWord;
use crate::store::{self, Presentation, StoreError};
use crate::time::{Ms, TimeSource};

type Listener = Box<dyn Fn(&SessionState) + Send>;

pub struct Session {
    folder: PathBuf,
    presentation: Presentation,
    listeners: Vec<Listener>,
    #[expect(dead_code, reason = "the Performance clock runs on it")]
    time: Arc<dyn TimeSource>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub folder: PathBuf,
    pub title: String,
    pub words: Vec<TimedWord>,
    pub script_end: Ms,
}

impl Session {
    pub fn create(
        parent: &Path,
        title: &str,
        time: Arc<dyn TimeSource>,
    ) -> Result<Self, StoreError> {
        let folder = store::create(parent, title)?;
        Self::open(&folder, time)
    }

    pub fn open(folder: &Path, time: Arc<dyn TimeSource>) -> Result<Self, StoreError> {
        let presentation = store::open(folder)?;
        Ok(Self {
            folder: folder.to_path_buf(),
            presentation,
            listeners: Vec::new(),
            time,
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
        store::save(&self.folder, &renamed)?;
        self.presentation = renamed;
        let state = self.state();
        self.listeners.iter().for_each(|listener| listener(&state));
        Ok(())
    }

    pub fn state(&self) -> SessionState {
        SessionState {
            folder: self.folder.clone(),
            title: self.presentation.title.clone(),
            words: self.presentation.script.timed_words(),
            script_end: self.presentation.script.end(),
        }
    }
}
