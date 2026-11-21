use serde::{Deserialize, Serialize};

use crate::time::Ms;

mod bar;
mod pipeline;
mod resample;

pub(crate) use bar::RecordingBar;
pub(crate) use pipeline::Taps;
use resample::Resampler;

pub const FEED_SAMPLE_RATE: u32 = 16_000;

pub type AudioCallback = Box<dyn FnMut(&[f32]) + Send>;

/// The machine's audio inputs. `open` delivers interleaved frames in the input's native format
/// until the returned handle is dropped.
pub trait AudioSource: Send + Sync {
    fn request_access(&self) -> Access;
    fn inputs(&self) -> Vec<Input>;
    fn default_input(&self) -> Option<String>;
    fn open(&self, input: &Input, on_audio: AudioCallback) -> Result<Box<dyn Send>, CaptureError>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Access {
    Granted,
    Denied,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    pub name: String,
    pub channels: u16,
    pub sample_rate: u32,
}

/// The presenter's pick of input, remembered per machine. No device means the system default;
/// channels count from 1.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InputChoice {
    pub device: Option<String>,
    pub channel: u16,
}

impl Default for InputChoice {
    fn default() -> Self {
        Self {
            device: None,
            channel: 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveInput {
    pub choice: InputChoice,
    pub device: Input,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingBarState {
    pub access: Access,
    pub inputs: Vec<Input>,
    pub input: Option<ActiveInput>,
    pub notice: Option<String>,
    pub recording: bool,
}

/// The input's peak level since the previous Meter, and how long the Recording has run, if one is.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Meter {
    pub peak: f32,
    pub clipped: bool,
    pub recorded: Option<Ms>,
}

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("the recording bar is not open")]
    BarClosed,
    #[error("Time to Present has no access to the microphone")]
    NoAccess,
    #[error("no audio input is available")]
    NoInput,
    #[error("a Recording is already running")]
    AlreadyRecording,
    #[error("no Recording is running")]
    NotRecording,
    #[error("could not open the audio input: {0}")]
    Device(String),
    #[error("could not write the Recording: {0}")]
    Wav(#[from] hound::Error),
    #[error("{0}")]
    Store(#[from] crate::store::StoreError),
    #[error("{0}")]
    Io(#[from] std::io::Error),
}
