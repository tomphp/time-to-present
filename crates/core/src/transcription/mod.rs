use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::models::Progress;
use crate::time::Ms;

mod live;
mod live_sidecar;
mod process;
mod queue;
mod sidecar;

pub use live::{
    LiveEvent, LiveFeed, LiveModel, LiveReport, LiveRevision, LiveTranscriber, ModelReport,
};
pub use live_sidecar::SidecarLiveTranscriber;
pub(crate) use queue::{JobId, TranscriptionQueue};
pub use sidecar::SidecarTranscriber;

/// One Transcription to run: a Recording's WAV, and the text the speaker was expected to say,
/// when there is one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptionJob {
    pub audio: PathBuf,
    pub prompt: Option<String>,
}

/// A Word the Transcription heard, timed in Recording Time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HeardWord {
    pub text: String,
    pub start: Ms,
    pub end: Ms,
    pub confidence: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TranscriptionEvent {
    /// The speech model is being fetched before the Transcription can start.
    Model(Progress),
    Progress(u8),
    Heard(Vec<HeardWord>),
    NoSpeech,
    Failed(String),
}

pub type Report = Box<dyn FnMut(TranscriptionEvent) + Send>;

/// A job under way: dropping it abandons the job.
pub type RunningJob = Box<dyn Send>;

/// Turns a Recording into timed Words.
pub trait Transcriber: Send + Sync {
    /// Starts the job, reporting its events from any thread until a `Heard`, `NoSpeech` or
    /// `Failed` event ends it.
    fn transcribe(&self, job: TranscriptionJob, report: Report) -> RunningJob;
}
