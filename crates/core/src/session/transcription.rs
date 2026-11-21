use serde::{Deserialize, Serialize};

use super::Session;
use crate::models::Progress;
use crate::script::Script;
use crate::store::Recording;
use crate::transcription::{HeardWord, JobId, TranscriptionEvent, TranscriptionJob};

const NO_SPEECH: &str = "No speech found";

/// The caret between Words where a Recording lands: before the given Word, or at the end of
/// the Script.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
pub struct InsertionPoint {
    pub before: Option<String>,
}

/// A stopped Recording whose Transcription has not landed, anchored to the Words either side.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPassage {
    pub recording_id: String,
    pub after: Option<String>,
    pub before: Option<String>,
    pub status: PendingStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PendingStatus {
    Queued,
    FetchingModel { percent: Option<u8> },
    Transcribing { percent: u8 },
    Failed { reason: String },
}

#[derive(Debug, thiserror::Error)]
pub enum PassageError {
    #[error("no Pending Passage for Recording {0}")]
    UnknownPassage(String),
    #[error("the Transcription of Recording {0} has not failed")]
    NotFailed(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Store(#[from] crate::store::StoreError),
}

pub(super) struct Pending {
    recording: Recording,
    job: JobId,
    passage: PendingPassage,
}

impl Pending {
    pub fn state(&self) -> PendingPassage {
        self.passage.clone()
    }

    /// Where the passage lands now: before its next Word, else after its previous one, else at
    /// the end, so edits around it while it was pending leave it in place.
    fn index_in(&self, script: &Script) -> usize {
        let position = |id: &Option<String>| {
            let id = id.as_ref()?;
            script.words.iter().position(|word| &word.id == id)
        };
        position(&self.passage.before)
            .or_else(|| position(&self.passage.after).map(|i| i + 1))
            .unwrap_or(script.words.len())
    }
}

impl Session {
    pub(super) fn land_transcriptions(&mut self) {
        let events = self.transcriptions.drain();
        if events.is_empty() {
            return;
        }
        for (job, event) in events {
            let Some(index) = self.pending.iter().position(|pending| pending.job == job) else {
                continue;
            };
            let status = match event {
                TranscriptionEvent::Model(progress) => PendingStatus::FetchingModel {
                    percent: percent_of(progress),
                },
                TranscriptionEvent::Progress(percent) => PendingStatus::Transcribing { percent },
                TranscriptionEvent::NoSpeech => PendingStatus::Failed {
                    reason: NO_SPEECH.into(),
                },
                TranscriptionEvent::Failed(reason) => PendingStatus::Failed { reason },
                TranscriptionEvent::Heard(words) => {
                    let pending = self.pending.remove(index);
                    self.land(&pending, &words);
                    continue;
                }
            };
            self.pending[index].passage.status = status;
        }
        self.publish();
    }

    fn land(&mut self, pending: &Pending, heard: &[HeardWord]) {
        self.change(|script, ids| {
            let index = pending.index_in(script);
            script.insert_passage(index, &pending.recording.id, heard, ids);
            Ok(((), Vec::new()))
        })
        .expect("splicing heard Words cannot fail");
    }

    /// Queues a failed Transcription again.
    pub fn retry_transcription(&mut self, recording_id: &str) -> Result<(), PassageError> {
        let index = self.pending_index(recording_id)?;
        if !matches!(
            self.pending[index].passage.status,
            PendingStatus::Failed { .. }
        ) {
            return Err(PassageError::NotFailed(recording_id.to_string()));
        }
        let job = self
            .transcriptions
            .enqueue(self.job_for(&self.pending[index].recording));
        self.pending[index].job = job;
        self.pending[index].passage.status = PendingStatus::Queued;
        self.publish();
        Ok(())
    }

    /// Drops a Pending Passage, with its Transcription, its WAV and its registration.
    pub fn discard_transcription(&mut self, recording_id: &str) -> Result<(), PassageError> {
        let index = self.pending_index(recording_id)?;
        let pending = self.pending.remove(index);
        self.transcriptions.abandon(pending.job);
        std::fs::remove_file(self.folder.join(&pending.recording.file))?;
        let mut unregistered = self.presentation.clone();
        unregistered
            .recordings
            .retain(|recording| recording.id != recording_id);
        self.save(unregistered)?;
        Ok(())
    }

    pub(super) fn queue_transcription(&mut self, recording: &Recording, at: InsertionPoint) {
        let words = &self.presentation.script.words;
        let index = at
            .before
            .as_ref()
            .and_then(|id| words.iter().position(|word| &word.id == id))
            .unwrap_or(words.len());
        let after = index.checked_sub(1).map(|i| words[i].id.clone());
        let before = words.get(index).map(|word| word.id.clone());
        let job = self.transcriptions.enqueue(self.job_for(recording));
        self.pending.push(Pending {
            recording: recording.clone(),
            job,
            passage: PendingPassage {
                recording_id: recording.id.clone(),
                after,
                before,
                status: PendingStatus::Queued,
            },
        });
    }

    fn job_for(&self, recording: &Recording) -> TranscriptionJob {
        TranscriptionJob {
            audio: self.folder.join(&recording.file),
            prompt: None,
        }
    }

    fn pending_index(&self, recording_id: &str) -> Result<usize, PassageError> {
        self.pending
            .iter()
            .position(|pending| pending.recording.id == recording_id)
            .ok_or_else(|| PassageError::UnknownPassage(recording_id.to_string()))
    }
}

fn percent_of(progress: Progress) -> Option<u8> {
    let total = progress.total?;
    Some((progress.downloaded * 100 / total.max(1)).min(100) as u8)
}
