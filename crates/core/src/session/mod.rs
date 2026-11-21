use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;

use crate::capture::{RecordingBar, RecordingBarState, Taps};
use crate::clock::{Clock, Snapshot, StreamEvent, Timeline};
use crate::platform::Platform;
use crate::script::{Edit, EditError, Ids, Script, TimedEvent, TimedWord};
use crate::store::{self, Presentation, StoreError};
use crate::time::Ms;
use crate::transcription::TranscriptionQueue;

mod clipboard;
mod clock;
mod history;
mod live;
mod recording;
mod transcription;

use clipboard::Clipboard;
use history::History;
use live::Live;
pub use live::LiveTranscript;
use transcription::Pending;
pub use transcription::{InsertionPoint, PendingPassage, PendingPassageError, PendingStatus};

type Listener = Box<dyn Fn(&SessionState) + Send>;
type StreamListener = Box<dyn Fn(&StreamEvent) + Send>;

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
    stream_listeners: Vec<StreamListener>,
    platform: Platform,
    bar: Option<RecordingBar>,
    taps: Arc<Taps>,
    recording_at: Option<InsertionPoint>,
    live: Live,
    transcriptions: TranscriptionQueue,
    pending: Vec<Pending>,
    unsaved_since: Option<Ms>,
    clock: Clock,
    previewing: bool,
    timeline: Timeline,
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
    pub locked: bool,
    pub live_transcript: Option<LiveTranscript>,
    /// The clock is playing a Preview the editor started, so the editor plays its sound.
    pub previewing: bool,
}

impl Session {
    pub fn create(parent: &Path, title: &str, platform: Platform) -> Result<Self, StoreError> {
        let folder = store::create(parent, title)?;
        Self::open(&folder, platform)
    }

    pub fn open(folder: &Path, platform: Platform) -> Result<Self, StoreError> {
        let presentation = store::open(folder)?;
        let taps = Arc::<Taps>::default();
        Ok(Self {
            folder: folder.to_path_buf(),
            ids: Ids::after(&presentation.script),
            clock: Clock::default(),
            previewing: false,
            timeline: Timeline::of(&presentation.script, 1),
            presentation,
            history: History::default(),
            clipboard: Clipboard::default(),
            moved: HashSet::new(),
            listeners: Vec::new(),
            stream_listeners: Vec::new(),
            bar: None,
            live: Live::new(platform.live.clone(), &taps),
            taps,
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
        self.refuse_while_locked()?;
        self.change(|script, ids| Ok(((), script.apply(edit, ids)?)))
    }

    /// Takes the Words out onto the clipboard with their Named Events, as one undo step.
    pub fn cut(&mut self, words: &[String]) -> Result<(), EditError> {
        self.refuse_while_locked()?;
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
        self.refuse_while_locked()?;
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
        self.refuse_while_locked()?;
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
    pub fn undo(&mut self) -> Result<(), EditError> {
        self.refuse_while_locked()?;
        if let Some(undone) = self.history.undo(&mut self.presentation.script) {
            self.moved.retain(|id| !undone.contains(id));
            self.changed();
        }
        Ok(())
    }

    pub fn redo(&mut self) -> Result<(), EditError> {
        self.refuse_while_locked()?;
        if let Some(redone) = self.history.redo(&mut self.presentation.script) {
            self.moved.extend(redone.iter().cloned());
            self.changed();
        }
        Ok(())
    }

    /// Selecting a Named Event clears its Moved badge.
    pub fn select_event(&mut self, id: &str) {
        if self.moved.remove(id) {
            self.publish();
        }
    }

    /// Saves what is unsaved and tells every client the stream is over.
    pub fn close(mut self) -> Result<(), StoreError> {
        let flushed = self.flush();
        self.broadcast(vec![StreamEvent::Closed {
            reason: "closed".into(),
        }]);
        flushed
    }

    /// Call it about every 100 ms: it runs the clock, follows the live model and the Live
    /// Transcript, lands what the Transcriptions have reported, then saves the Presentation once
    /// the autosave delay has passed since the last change.
    pub fn poll(&mut self) -> Result<(), StoreError> {
        self.advance_clock();
        self.follow_live();
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

    /// Where the Performance stands now: what every connecting client receives first.
    pub fn snapshot(&mut self) -> Snapshot {
        self.advance_clock();
        self.clock
            .snapshot(&self.timeline, self.platform.time.now())
    }

    pub fn folder(&self) -> &Path {
        &self.folder
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
            locked: self.clock.is_playing() || self.is_recording(),
            live_transcript: self.live.transcript(),
            previewing: self.previewing,
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

    fn is_recording(&self) -> bool {
        self.bar.as_ref().is_some_and(RecordingBar::is_recording)
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

    /// The edit lock: the Script is read-only while recording, and while the clock plays. The
    /// clock is judged as it stands now rather than at the last poll.
    fn refuse_while_locked(&mut self) -> Result<(), EditError> {
        if self.is_recording() {
            return Err(EditError::ReadOnlyWhileRecording);
        }
        self.advance_clock();
        if self.clock.is_playing() {
            return Err(EditError::ClockPlaying);
        }
        Ok(())
    }

    /// A Script change: a new version to autosave, and a Snapshot of the clock over it.
    fn changed(&mut self) {
        let now = self.platform.time.now();
        self.unsaved_since = Some(now);
        self.timeline = Timeline::of(&self.presentation.script, self.timeline.version + 1);
        let events = self.clock.script_changed(&self.timeline, now);
        self.broadcast(events);
        self.publish();
    }

    fn broadcast(&self, events: Vec<StreamEvent>) {
        for event in &events {
            self.stream_listeners
                .iter()
                .for_each(|listener| listener(event));
        }
    }

    fn publish(&self) {
        let state = self.state();
        self.listeners.iter().for_each(|listener| listener(&state));
    }
}
