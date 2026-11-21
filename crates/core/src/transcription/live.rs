use serde::{Deserialize, Serialize};

use super::HeardWord;

/// An edit to the Live Transcript, as the sidecar sends it: drop every Word from `from` on,
/// append `words`, and the first `stable` Words are settled.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct LiveRevision {
    pub from: usize,
    pub stable: usize,
    pub words: Vec<HeardWord>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LiveEvent {
    Revised(LiveRevision),
    Failed(String),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LiveModel {
    Fetching { percent: Option<u8> },
    Ready,
    Failed { reason: String },
}

pub type LiveReport = Box<dyn FnMut(LiveEvent) + Send>;
pub type ModelReport = Box<dyn FnMut(LiveModel) + Send>;

/// A live session's audio input. Dropping it ends the session.
pub trait LiveFeed: Send {
    /// Takes 16 kHz mono samples. It is called on the audio thread, so it must not block.
    fn push(&mut self, samples: &[f32]);
}

/// Hears a Recording as it is made, for the Live Transcript.
pub trait LiveTranscriber: Send + Sync {
    /// Makes sure the live model is installed, reporting from any thread until it is `Ready`
    /// or `Failed`: at once, on the calling thread, when it already is.
    fn prepare(&self, report: ModelReport);

    /// Starts a live session on the samples pushed to the returned feed, reporting its
    /// revisions from any thread.
    fn start(&self, report: LiveReport) -> Box<dyn LiveFeed>;
}
