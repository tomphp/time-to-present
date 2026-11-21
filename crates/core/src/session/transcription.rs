use serde::{Deserialize, Serialize};

use super::Session;
use super::orphans::remove_wav;
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

impl InsertionPoint {
    fn index_in(&self, script: &Script) -> usize {
        let before = self.before.as_deref().and_then(|id| script.position(id));
        before.unwrap_or(script.words.len())
    }
}

/// Where a Recording lands: at an Insertion Point, or over the Words it Re-records.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Landing {
    At(InsertionPoint),
    Over(Vec<String>),
}

impl Landing {
    pub fn re_recording(&self) -> &[String] {
        match self {
            Landing::At(_) => &[],
            Landing::Over(words) => words,
        }
    }

    /// The ids of the Words either side of where it lands, and of the Words it replaces that
    /// are still in the Script.
    pub fn anchors_in(&self, script: &Script) -> (Option<String>, Option<String>, Vec<String>) {
        let (start, end, replacing) = self.span_in(script);
        let after = start.checked_sub(1).map(|i| script.words[i].id.clone());
        let before = script.words.get(end).map(|word| word.id.clone());
        (after, before, replacing)
    }

    /// The Words it replaces that are still in the Script, and the indexes either side of them.
    fn span_in(&self, script: &Script) -> (usize, usize, Vec<String>) {
        let positions: Vec<usize> = self
            .re_recording()
            .iter()
            .filter_map(|id| script.position(id))
            .collect();
        match positions.first().zip(positions.last()) {
            Some((&first, &last)) => {
                let replacing = positions.iter().map(|&i| script.words[i].id.clone());
                (first, last + 1, replacing.collect())
            }
            None => {
                let index = match self {
                    Landing::At(point) => point.index_in(script),
                    Landing::Over(_) => script.words.len(),
                };
                (index, index, Vec::new())
            }
        }
    }
}

/// A stopped Recording whose Transcription has not landed, anchored to the Words either side,
/// with the Words it replaces when it is a Re-record.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPassage {
    pub recording_id: String,
    pub after: Option<String>,
    pub before: Option<String>,
    pub replacing: Vec<String>,
    pub status: PendingStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PendingStatus {
    Queued,
    FetchingModel {
        percent: Option<u8>,
    },
    Transcribing {
        percent: u8,
    },
    /// Left by an earlier session without Words: the presenter chooses Transcribe or Discard.
    Interrupted,
    Failed {
        reason: String,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum PendingPassageError {
    #[error("no Pending Passage for Recording {0}")]
    UnknownPassage(String),
    #[error("the Transcription of Recording {0} is neither failed nor interrupted")]
    NotRetryable(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Store(#[from] crate::store::StoreError),
}

/// A Pending Passage with its Recording and Transcription job, in the order the Recordings
/// were made.
pub(super) struct Pending {
    pub(super) recording: Recording,
    pub(super) job: Option<JobId>,
    pub(super) passage: PendingPassage,
    /// Words heard under the edit lock, waiting for the clock to stop.
    pub(super) heard: Option<Vec<HeardWord>>,
}

impl Pending {
    pub fn state(&self) -> PendingPassage {
        self.passage.clone()
    }

    /// Where the passage lands now, with the Words it replaces that are still there: in place of
    /// those, else before its next Word, else after its previous one, else at the end, so edits
    /// around it while it was pending leave it in place.
    fn landing_in(&self, script: &Script) -> (usize, Vec<String>) {
        let replaced: Vec<String> = (self.passage.replacing.iter())
            .filter(|id| script.position(id).is_some())
            .cloned()
            .collect();
        let at = replaced.first().and_then(|id| script.position(id));
        (at.unwrap_or_else(|| self.index_in(script)), replaced)
    }

    fn index_in(&self, script: &Script) -> usize {
        let position = |id: &Option<String>| script.position(id.as_deref()?);
        position(&self.passage.before)
            .or_else(|| position(&self.passage.after).map(|i| i + 1))
            .unwrap_or(script.words.len())
    }

    /// Anchors to the new Words where it was anchored to the Words they replaced.
    fn follow_replaced(&mut self, replaced: &[String], first: &str, last: &str) {
        let was_replaced =
            |id: &Option<String>| id.as_ref().is_some_and(|id| replaced.contains(id));
        if was_replaced(&self.passage.after) {
            self.passage.after = Some(last.to_string());
        }
        if was_replaced(&self.passage.before) {
            self.passage.before = Some(first.to_string());
        }
    }

    fn shares_spot_with(&self, other: &Pending) -> bool {
        self.passage.after == other.passage.after && self.passage.before == other.passage.before
    }
}

impl Session {
    /// Lands what the Transcriptions have reported. A Script change is a Script edit, so Words
    /// heard while the clock is playing wait, and land on the first poll after it stops.
    pub(super) fn land_transcriptions(&mut self) {
        let locked = self.clock.is_playing();
        if !locked {
            self.land_held();
        }
        let events = self.transcriptions.drain();
        if events.is_empty() {
            return;
        }
        for (job, event) in events {
            let Some(index) = self
                .pending
                .iter()
                .position(|pending| pending.job == Some(job))
            else {
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
                TranscriptionEvent::Heard(words) if locked => {
                    self.pending[index].heard = Some(words);
                    PendingStatus::Transcribing { percent: 100 }
                }
                TranscriptionEvent::Heard(words) => {
                    self.land(index, &words);
                    continue;
                }
            };
            self.pending[index].passage.status = status;
        }
        self.publish();
    }

    fn land_held(&mut self) {
        let next_held = |pending: &mut Vec<Pending>| {
            let mut held = pending.iter_mut().enumerate();
            held.find_map(|(index, pending)| pending.heard.take().map(|heard| (index, heard)))
        };
        while let Some((index, heard)) = next_held(&mut self.pending) {
            self.land(index, &heard);
        }
    }

    /// Splices the heard Words in, in place of any they Re-record, as one undo step. Other
    /// passages pending at the same spot keep their order: earlier ones now land before these
    /// Words, later ones after them. Those anchored to replaced Words anchor to these instead.
    fn land(&mut self, index: usize, heard: &[HeardWord]) {
        let landed = self.pending.remove(index);
        let script = &self.presentation.script;
        let (at, replaced) = landed.landing_in(script);
        let words = script.transcribed(at, &landed.recording.id, heard, &mut self.ids);
        let Some((first, last)) = words.first().zip(words.last()) else {
            return;
        };
        for (position, pending) in self.pending.iter_mut().enumerate() {
            pending.follow_replaced(&replaced, &first.id, &last.id);
            if !pending.shares_spot_with(&landed) {
                continue;
            }
            if position < index {
                pending.passage.before = Some(first.id.clone());
            } else {
                pending.passage.after = Some(last.id.clone());
            }
        }
        self.change(|script, _| Ok(((), script.splice_transcribed(at, &replaced, words))))
            .expect("splicing transcribed Words cannot fail");
    }

    /// Queues a failed or interrupted Transcription.
    pub fn retry_transcription(&mut self, recording_id: &str) -> Result<(), PendingPassageError> {
        let index = self.pending_index(recording_id)?;
        if !matches!(
            self.pending[index].passage.status,
            PendingStatus::Failed { .. } | PendingStatus::Interrupted
        ) {
            return Err(PendingPassageError::NotRetryable(recording_id.to_string()));
        }
        let job = self
            .transcriptions
            .enqueue(self.job_for(&self.pending[index].recording));
        self.pending[index].job = Some(job);
        self.pending[index].passage.status = PendingStatus::Queued;
        self.publish();
        Ok(())
    }

    /// Drops a Pending Passage, with its Transcription, its registration and its WAV.
    pub fn discard_transcription(&mut self, recording_id: &str) -> Result<(), PendingPassageError> {
        let index = self.pending_index(recording_id)?;
        let mut unregistered = self.presentation.clone();
        unregistered
            .recordings
            .retain(|recording| recording.id != recording_id);
        self.save(unregistered)?;
        let discarded = self.pending.remove(index);
        if let Some(job) = discarded.job {
            self.transcriptions.abandon(job);
        }
        remove_wav(&self.folder.join(&discarded.recording.file))?;
        self.publish();
        Ok(())
    }

    pub(super) fn queue_transcription(&mut self, recording: &Recording, landing: Landing) {
        let (after, before, replacing) = landing.anchors_in(&self.presentation.script);
        let job = self.transcriptions.enqueue(self.job_for(recording));
        self.pending.push(Pending {
            recording: recording.clone(),
            job: Some(job),
            passage: PendingPassage {
                recording_id: recording.id.clone(),
                after,
                before,
                replacing,
                status: PendingStatus::Queued,
            },
            heard: None,
        });
    }

    fn job_for(&self, recording: &Recording) -> TranscriptionJob {
        TranscriptionJob {
            audio: self.folder.join(&recording.file),
            prompt: None,
        }
    }

    fn pending_index(&self, recording_id: &str) -> Result<usize, PendingPassageError> {
        self.pending
            .iter()
            .position(|pending| pending.recording.id == recording_id)
            .ok_or_else(|| PendingPassageError::UnknownPassage(recording_id.to_string()))
    }
}

fn failed(reason: &str) -> PendingStatus {
    PendingStatus::Failed {
        reason: reason.to_string(),
    }
}
