use serde::{Deserialize, Serialize};

use super::Session;
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

/// A Pending Passage with its Recording and Transcription job, in the order the Recordings
/// were made.
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
        let position = |id: &Option<String>| script.position(id.as_deref()?);
        position(&self.passage.before)
            .or_else(|| position(&self.passage.after).map(|i| i + 1))
            .unwrap_or(script.words.len())
    }

    fn shares_spot_with(&self, other: &Pending) -> bool {
        self.passage.after == other.passage.after && self.passage.before == other.passage.before
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
                    percent: progress.percent(),
                },
                TranscriptionEvent::Progress(percent) => PendingStatus::Transcribing { percent },
                TranscriptionEvent::Heard(words) if words.is_empty() => failed(NO_SPEECH),
                TranscriptionEvent::NoSpeech => failed(NO_SPEECH),
                TranscriptionEvent::Failed(reason) => failed(&reason),
                TranscriptionEvent::Heard(words) => {
                    self.land(index, &words);
                    continue;
                }
            };
            self.pending[index].passage.status = status;
        }
        self.publish();
    }

    /// Splices the heard Words in as one undo step. Other passages pending at the same spot
    /// keep their order: earlier ones now land before these Words, later ones after them.
    fn land(&mut self, index: usize, heard: &[HeardWord]) {
        let landed = self.pending.remove(index);
        let (first, last) = self
            .change(|script, ids| {
                let at = landed.index_in(script);
                script.insert_passage(at, &landed.recording.id, heard, ids);
                let words = &script.words;
                let ends = (words[at].id.clone(), words[at + heard.len() - 1].id.clone());
                Ok((ends, Vec::new()))
            })
            .expect("splicing heard Words cannot fail");
        for (position, pending) in self.pending.iter_mut().enumerate() {
            if !pending.shares_spot_with(&landed) {
                continue;
            }
            if position < index {
                pending.passage.before = Some(first.clone());
            } else {
                pending.passage.after = Some(last.clone());
            }
        }
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

    /// Drops a Pending Passage, with its Transcription, its registration and its WAV.
    pub fn discard_transcription(&mut self, recording_id: &str) -> Result<(), PassageError> {
        let index = self.pending_index(recording_id)?;
        let mut unregistered = self.presentation.clone();
        unregistered
            .recordings
            .retain(|recording| recording.id != recording_id);
        self.save(unregistered)?;
        let discarded = self.pending.remove(index);
        self.transcriptions.abandon(discarded.job);
        match std::fs::remove_file(self.folder.join(&discarded.recording.file)) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error.into()),
            _ => {}
        }
        self.publish();
        Ok(())
    }

    pub(super) fn queue_transcription(&mut self, recording: &Recording, at: InsertionPoint) {
        let script = &self.presentation.script;
        let index = at
            .before
            .as_deref()
            .and_then(|id| script.position(id))
            .unwrap_or(script.words.len());
        let after = index.checked_sub(1).map(|i| script.words[i].id.clone());
        let before = script.words.get(index).map(|word| word.id.clone());
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

fn failed(reason: &str) -> PendingStatus {
    PendingStatus::Failed {
        reason: reason.to_string(),
    }
}
