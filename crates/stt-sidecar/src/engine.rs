use std::path::Path;

use serde::Serialize;

pub const SAMPLE_RATE: usize = 16_000;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Word {
    pub text: String,
    pub start: u64,
    pub end: u64,
    pub confidence: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Live,
    Transcription,
}

/// A speech recogniser over 16 kHz mono audio. Word times are milliseconds from
/// the start of the audio it is given.
pub trait Engine {
    fn transcribe(
        &mut self,
        audio: &[f32],
        progress: &mut dyn FnMut(u8),
    ) -> Result<Vec<Word>, String>;
}

pub trait Loader {
    fn load(&self, model: &Path, language: &str, mode: Mode) -> Result<Box<dyn Engine>, String>;
}

/// The loader of a sidecar built without the `whisper` feature.
pub struct NoEngine;

impl Loader for NoEngine {
    fn load(&self, _model: &Path, _language: &str, _mode: Mode) -> Result<Box<dyn Engine>, String> {
        Err(
            "this sidecar was built without a speech engine; build it with --features whisper"
                .into(),
        )
    }
}
