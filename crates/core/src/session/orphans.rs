use std::collections::HashSet;
use std::path::Path;

use super::transcription::{Landing, Pending};
use super::{PendingPassage, PendingPassageError, PendingStatus, Session};
use crate::script::Script;
use crate::store::{self, Recording, StoreError};

impl Session {
    /// Offers the Recordings no Word references, left by an earlier session, for Transcribe at
    /// the end of the Script or Discard.
    pub(super) fn offer_unreferenced_recordings(&mut self) -> Result<(), StoreError> {
        let found = store::unreferenced_recordings(&self.folder, &self.presentation)?;
        if found.is_empty() {
            return Ok(());
        }
        let mut registered = self.presentation.clone();
        for recording in &found {
            if !registered.recordings.contains(recording) {
                registered.recordings.push(recording.clone());
            }
        }
        self.save(registered)?;
        let (after, before, _) = Landing::default().anchors_in(&self.presentation.script);
        for recording in found {
            self.pending.push(Pending {
                passage: PendingPassage {
                    recording_id: recording.id.clone(),
                    after: after.clone(),
                    before: before.clone(),
                    replacing: Vec::new(),
                    status: PendingStatus::Interrupted,
                },
                recording,
                job: None,
                heard: None,
            });
        }
        Ok(())
    }

    /// Deletes the WAVs, and their registrations, that no Word references and no undo or redo
    /// step or the clipboard could bring back, along with the ones awaiting Transcribe or
    /// Discard. Recordings still being transcribed stay.
    pub fn remove_unused_recordings(&mut self) -> Result<(), PendingPassageError> {
        let script = &self.presentation.script;
        let reachable: HashSet<&str> = std::iter::once(script)
            .chain(self.history.scripts())
            .flat_map(Script::recording_ids)
            .chain(self.clipboard.recording_ids())
            .collect();
        let held: HashSet<&str> = self
            .pending
            .iter()
            .filter(|pending| pending.passage.status != PendingStatus::Interrupted)
            .map(|pending| pending.recording.id.as_str())
            .collect();
        let unused: Vec<Recording> = self
            .presentation
            .recordings
            .iter()
            .filter(|recording| !reachable.contains(recording.id.as_str()))
            .filter(|recording| !held.contains(recording.id.as_str()))
            .cloned()
            .collect();
        if unused.is_empty() {
            return Ok(());
        }
        let mut kept = self.presentation.clone();
        kept.recordings
            .retain(|recording| !unused.contains(recording));
        self.save(kept)?;
        self.pending
            .retain(|pending| !unused.contains(&pending.recording));
        for recording in &unused {
            remove_wav(&self.folder.join(&recording.file))?;
        }
        self.publish();
        Ok(())
    }
}

pub(super) fn remove_wav(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}
