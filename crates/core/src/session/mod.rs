use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;

use crate::capture::{RecordingBar, RecordingBarState, Taps};
use crate::platform::Platform;
use crate::script::{Edit, EditError, Ids, Script, TimedEvent, TimedWord};
use crate::store::{self, Presentation, StoreError};
use crate::time::Ms;

mod clipboard;
mod history;
mod recording;

use clipboard::Clipboard;
use history::History;

type Listener = Box<dyn Fn(&SessionState) + Send>;

/// How long after the last edit the Presentation is saved.
pub const AUTOSAVE_DELAY: Ms = 500;

pub struct Session {
    folder: PathBuf,
    presentation: Presentation,
    ids: Ids,
    history: History,
    clipboard: Clipboard,
    moved: HashSet<String>,
    listeners: Vec<Listener>,
    platform: Platform,
    bar: Option<RecordingBar>,
    taps: Arc<Taps>,
    unsaved_since: Option<Ms>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub folder: PathBuf,
    pub title: String,
    pub words: Vec<TimedWord>,
    pub named_events: Vec<TimedEvent>,
    pub moved_events: Vec<String>,
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
            ids: Ids::after(&presentation.script),
            presentation,
            history: History::default(),
            clipboard: Clipboard::default(),
            moved: HashSet::new(),
            listeners: Vec::new(),
            platform,
            bar: None,
            taps: Arc::default(),
            unsaved_since: None,
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

    /// Applies one edit (a Batch counts as one) as a single undo step, or leaves the Script
    /// untouched if any part of it fails or nothing changes.
    pub fn edit(&mut self, edit: Edit) -> Result<(), EditError> {
        self.change(|script, ids| Ok(((), script.apply(edit, ids)?)))
    }

    /// Takes the Words out onto the clipboard with their Named Events, as one undo step.
    pub fn cut(&mut self, words: &[String]) -> Result<(), EditError> {
        let passage = self.change(|script, _| Ok((script.cut(words)?, Vec::new())))?;
        self.clipboard.hold(passage, true);
        Ok(())
    }

    pub fn copy(&mut self, words: &[String]) -> Result<(), EditError> {
        let passage = self.presentation.script.copy(words)?;
        self.clipboard.hold(passage, false);
        Ok(())
    }

    /// Pastes the clipboard's passage when `text` reads as it, and otherwise `text` as typed
    /// Words. A cut passage moving back in gives its Named Events a Moved badge.
    pub fn paste(&mut self, after: Option<String>, text: &str) -> Result<(), EditError> {
        let script = &self.presentation.script;
        let Some(paste) = self.clipboard.paste(text, script, &mut self.ids) else {
            let text = text.to_string();
            return self.edit(Edit::InsertText { after, text });
        };
        self.change(|script, _| {
            script.paste(after.as_deref(), paste.passage)?;
            Ok(((), paste.moved))
        })?;
        self.clipboard.pasted();
        Ok(())
    }

    /// Undoes the last step, and with it the Moved badges that step set.
    pub fn undo(&mut self) {
        if let Some(undone) = self.history.undo(&mut self.presentation.script) {
            self.moved.retain(|id| !undone.contains(id));
            self.changed();
        }
    }

    pub fn redo(&mut self) {
        if let Some(redone) = self.history.redo(&mut self.presentation.script) {
            self.moved.extend(redone.iter().cloned());
            self.changed();
        }
    }

    /// Selecting a Named Event clears its Moved badge.
    pub fn select_event(&mut self, id: &str) {
        if self.moved.remove(id) {
            self.publish();
        }
    }

    /// Saves the Presentation once the autosave delay has passed since the last change.
    /// Call it regularly; it does nothing until then.
    pub fn tick(&mut self) -> Result<(), StoreError> {
        match self.unsaved_since {
            Some(since) if self.platform.time.now() - since >= AUTOSAVE_DELAY => self.flush(),
            _ => Ok(()),
        }
    }

    /// Saves any unsaved change now. After a failed save the wait starts again.
    pub fn flush(&mut self) -> Result<(), StoreError> {
        if self.unsaved_since.is_none() {
            return Ok(());
        }
        let saved = store::save(&self.folder, &self.presentation);
        self.unsaved_since = saved.is_err().then(|| self.platform.time.now());
        saved
    }

    pub fn state(&self) -> SessionState {
        SessionState {
            folder: self.folder.clone(),
            title: self.presentation.title.clone(),
            words: self.presentation.script.timed_words(),
            named_events: self.presentation.script.timed_events(),
            moved_events: self.moved_events(),
            script_end: self.presentation.script.end(),
            recording_bar: self.bar.as_ref().map(RecordingBar::state),
        }
    }

    /// Runs a change to the Script as one undo step, giving the Named Events it reports
    /// re-anchoring a Moved badge, or puts the Script back if it fails.
    fn change<T>(
        &mut self,
        change: impl FnOnce(&mut Script, &mut Ids) -> Result<(T, Vec<String>), EditError>,
    ) -> Result<T, EditError> {
        let before = self.presentation.script.clone();
        let (changed, reanchored) = match change(&mut self.presentation.script, &mut self.ids) {
            Ok(changed) => changed,
            Err(error) => {
                self.presentation.script = before;
                return Err(error);
            }
        };
        if self.presentation.script == before {
            return Ok(changed);
        }
        let newly_moved = reanchored
            .into_iter()
            .filter(|id| self.moved.insert(id.clone()))
            .collect();
        self.history.record(before, newly_moved);
        self.changed();
        Ok(changed)
    }

    fn moved_events(&self) -> Vec<String> {
        let events = self.presentation.script.named_events.iter();
        events
            .filter(|event| self.moved.contains(&event.id))
            .map(|event| event.id.clone())
            .collect()
    }

    /// Saves at once, as renaming and registering a Recording do; any pending autosave goes with it.
    fn save(&mut self, presentation: Presentation) -> Result<(), StoreError> {
        store::save(&self.folder, &presentation)?;
        self.presentation = presentation;
        self.unsaved_since = None;
        self.publish();
        Ok(())
    }

    fn changed(&mut self) {
        self.unsaved_since = Some(self.platform.time.now());
        self.publish();
    }

    fn publish(&self) {
        let state = self.state();
        self.listeners.iter().for_each(|listener| listener(&state));
    }
}
