use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;

use crate::capture::{RecordingBar, RecordingBarState, Taps};
use crate::platform::Platform;
use crate::script::{Edit, EditError, Ids, Script, TimedEvent, TimedWord};
use crate::store::{self, Presentation, StoreError};
use crate::time::Ms;
use crate::transcription::TranscriptionQueue;

mod clipboard;
mod history;
mod recording;
mod transcription;

use clipboard::Clipboard;
use history::History;
use transcription::Pending;
pub use transcription::{InsertionPoint, PassageError, PendingPassage, PendingStatus};

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
    recording_at: Option<InsertionPoint>,
    transcriptions: TranscriptionQueue,
    pending: Vec<Pending>,
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
    pub pending_passages: Vec<PendingPassage>,
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
            bar: None,
            taps: Arc::default(),
            recording_at: None,
            transcriptions: TranscriptionQueue::new(platform.transcriber.clone()),
            pending: Vec::new(),
            unsaved_since: None,
            platform,
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
        self.clipboard.hold_cut(passage);
        Ok(())
    }

    pub fn copy(&mut self, words: &[String]) -> Result<(), EditError> {
        let passage = self.presentation.script.copy(words)?;
        self.clipboard.hold_copy(passage);
        Ok(())
    }

    /// Pastes the clipboard's passage when `text` reads as it, and otherwise `text` as typed
    /// Words, deleting the Words it replaces first, as one undo step. A cut passage moving back
    /// in gives its Named Events a Moved badge.
    pub fn paste(
        &mut self,
        after: Option<String>,
        replacing: &[String],
        text: &str,
    ) -> Result<(), EditError> {
        let script = &self.presentation.script;
        let held = self.clipboard.paste(text, script, &mut self.ids);
        let pastes_held = held.is_some();
        self.change(|script, ids| {
            let mut reanchored = Vec::new();
            if !replacing.is_empty() {
                let words = replacing.to_vec();
                reanchored = script.apply(Edit::Delete { words }, ids)?;
            }
            match held {
                Some(paste) => {
                    script.paste(after.as_deref(), paste.passage)?;
                    reanchored.extend(paste.moved);
                }
                None => {
                    let text = text.to_string();
                    reanchored.extend(script.apply(Edit::InsertText { after, text }, ids)?);
                }
            }
            Ok(((), reanchored))
        })?;
        if pastes_held {
            self.clipboard.pasted();
        }
        Ok(())
    }

    /// Applies `edit` as all that `drag` has done so far, to the Script as it was when the drag
    /// began, so the drag is one undo step. Any other change to the Script, undo or redo ends
    /// the drag, and its steps that land after that are ignored. Only a Move, Trim or
    /// Named Event move can be dragged.
    pub fn drag(&mut self, drag: &str, edit: Edit) -> Result<(), EditError> {
        if self.history.drag_ended(drag) {
            return Ok(());
        }
        let start = self.history.drag_start(drag).cloned();
        self.apply_timing_run(drag, start, edit)
    }

    /// Applies a Move or Trim as part of the run of nudges named `run`, so that a run of them,
    /// with nothing else changing the Script between, is one undo step.
    pub fn nudge(&mut self, run: &str, edit: Edit) -> Result<(), EditError> {
        let run = format!("nudge:{run}");
        let continuing = self.history.drag_start(&run).is_some();
        let base = continuing.then(|| self.presentation.script.clone());
        self.apply_timing_run(&run, base, edit)
    }

    /// Applies a Move or Trim to `base`, the Script the run began from, or to the current Script
    /// when `base` is None because the run is only starting. A run that ends back at its start
    /// leaves no undo step.
    fn apply_timing_run(
        &mut self,
        run: &str,
        base: Option<Script>,
        edit: Edit,
    ) -> Result<(), EditError> {
        if !edit.is_draggable() {
            return Err(EditError::NotDraggable);
        }
        let mut changed = base
            .clone()
            .unwrap_or_else(|| self.presentation.script.clone());
        changed.apply(edit, &mut self.ids)?;
        if changed == self.presentation.script {
            return Ok(());
        }
        match base {
            Some(start) if start == changed => self.history.drop_drag_step(),
            Some(_) => {}
            None => self
                .history
                .record_drag(self.presentation.script.clone(), run),
        }
        self.presentation.script = changed;
        self.changed();
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

    /// Runs the Session's background work: lands what the Transcriptions have reported, and
    /// saves the Presentation once the autosave delay has passed since the last change.
    /// Call it regularly.
    pub fn tick(&mut self) -> Result<(), StoreError> {
        self.land_transcriptions();
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
            pending_passages: self.pending.iter().map(Pending::state).collect(),
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
