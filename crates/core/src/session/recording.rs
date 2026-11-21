use std::path::PathBuf;

use super::transcription::{Landing, Pending};
use super::{InsertionPoint, Session};
use crate::capture::{CaptureError, InputChoice, Meter, RecordingBar};
use crate::store::{self, Recording};

impl Session {
    /// Opens the recording bar on the chosen input, asking for microphone access first.
    pub fn open_recording_bar(&mut self, choice: InputChoice) {
        drop(self.bar.take());
        let mut bar = RecordingBar::open(&self.platform, choice, &self.taps);
        if let Some(model) = self.live.prepare_model() {
            bar.set_live_model(model);
        }
        self.bar = Some(bar);
        self.publish();
    }

    pub fn select_input(&mut self, choice: InputChoice) -> Result<(), CaptureError> {
        let bar = self.bar.as_mut().ok_or(CaptureError::BarClosed)?;
        let selected = bar.select(&self.platform, choice, &self.taps);
        self.publish();
        selected
    }

    pub fn close_recording_bar(&mut self) -> Result<(), CaptureError> {
        if self.bar.as_ref().is_some_and(RecordingBar::is_recording) {
            return Err(CaptureError::AlreadyRecording);
        }
        self.bar = None;
        self.publish();
        Ok(())
    }

    /// Starts a Recording that will land at the Insertion Point, with its Live Transcript there.
    pub fn start_recording(&mut self, at: InsertionPoint) -> Result<(), CaptureError> {
        self.start(Landing::At(at))
    }

    /// Starts a Re-record of the Words, which stay in the Script until its Transcription lands.
    pub fn start_re_recording(&mut self, words: &[String]) -> Result<(), CaptureError> {
        let range = self.presentation.script.run_of(words)?;
        let mut pending = self.pending.iter().flat_map(Pending::replacing);
        if let Some(taken) = pending.find(|id| range.contains(id)) {
            return Err(CaptureError::AlreadyReRecorded(taken.clone()));
        }
        self.start(Landing::Over(range))
    }

    fn start(&mut self, landing: Landing) -> Result<(), CaptureError> {
        let recording = store::new_recording(&self.folder, &self.presentation)?;
        let path = self.folder.join(&recording.file);
        let bar = self.bar.as_mut().ok_or(CaptureError::BarClosed)?;
        let (after, before, _) = landing.anchors_in(&self.presentation.script);
        self.live.start(after, before);
        if let Err(error) = bar.start(&self.platform, recording, path) {
            self.live.stop();
            return Err(error);
        }
        self.recording_at = Some(landing);
        self.publish();
        Ok(())
    }

    /// Stops the Recording, registers its WAV in the Presentation and queues its Transcription
    /// as a Pending Passage, leaving the Words as they are.
    pub fn stop_recording(&mut self) -> Result<Recording, CaptureError> {
        let bar = self.bar.as_mut().ok_or(CaptureError::BarClosed)?;
        self.live.stop();
        let recording = bar.stop()?;
        let at = self.recording_at.take().unwrap_or_default();
        let mut registered = self.presentation.clone();
        registered.recordings.push(recording.clone());
        self.save(registered)?;
        self.queue_transcription(&recording, at);
        self.publish();
        Ok(recording)
    }

    /// Stops the Recording and deletes its WAV, leaving no trace.
    pub fn cancel_recording(&mut self) -> Result<(), CaptureError> {
        let bar = self.bar.as_mut().ok_or(CaptureError::BarClosed)?;
        self.live.stop();
        let cancelled = bar.cancel();
        self.recording_at = None;
        self.publish();
        cancelled
    }

    pub(super) fn follow_live(&mut self) {
        let model_changed = self.follow_live_model();
        if self.live.follow() || model_changed {
            self.publish();
        }
    }

    fn follow_live_model(&mut self) -> bool {
        let (Some(bar), Some(model)) = (self.bar.as_mut(), self.live.model_update()) else {
            return false;
        };
        bar.set_live_model(model);
        true
    }

    /// For reading a Recording's waveform without holding the Session.
    pub fn recording_file(&self, id: &str) -> Option<PathBuf> {
        let recordings = &self.presentation.recordings;
        let recording = recordings.iter().find(|recording| recording.id == id)?;
        Some(self.folder.join(&recording.file))
    }

    pub fn subscribe_meter(&self, listener: impl Fn(Meter) + Send + 'static) {
        self.taps.add_meter(listener);
    }

    /// The Recording's chosen channel at 16 kHz, for live speech-to-text.
    pub fn subscribe_feed(&self, listener: impl FnMut(&[f32]) + Send + 'static) {
        self.taps.add_feed(listener);
    }
}
