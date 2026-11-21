use std::path::PathBuf;

use super::{InsertionPoint, Session};
use crate::capture::{CaptureError, InputChoice, Meter, RecordingBar};
use crate::store::{self, Recording};

impl Session {
    /// Opens the recording bar on the chosen input, asking for microphone access first.
    pub fn open_recording_bar(&mut self, choice: InputChoice) {
        drop(self.bar.take());
        self.bar = Some(RecordingBar::open(&self.platform, choice, &self.taps));
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

    /// Starts a Recording that will land at the Insertion Point.
    pub fn start_recording(&mut self, at: InsertionPoint) -> Result<(), CaptureError> {
        let recording = store::new_recording(&self.folder, &self.presentation)?;
        let path = self.folder.join(&recording.file);
        let bar = self.bar.as_mut().ok_or(CaptureError::BarClosed)?;
        bar.start(&self.platform, recording, path)?;
        self.recording_at = Some(at);
        self.publish();
        Ok(())
    }

    /// Stops the Recording, registers its WAV in the Presentation and queues its Transcription
    /// as a Pending Passage, leaving the Words as they are.
    pub fn stop_recording(&mut self) -> Result<Recording, CaptureError> {
        let bar = self.bar.as_mut().ok_or(CaptureError::BarClosed)?;
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
        let cancelled = bar.cancel();
        self.recording_at = None;
        self.publish();
        cancelled
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
