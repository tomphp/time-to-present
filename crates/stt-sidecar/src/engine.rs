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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Mode {
    Live,
    Transcription { prompt: Option<String> },
}

/// A speech recogniser over 16 kHz mono audio. Word times are milliseconds from
/// the start of the audio it is given.
pub trait Engine {
    fn recognise(
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

pub fn samples_to_ms(samples: usize) -> u64 {
    ((samples * 1000) as f64 / SAMPLE_RATE as f64).round() as u64
}

pub fn ms_to_samples(ms: u64) -> usize {
    ms as usize * SAMPLE_RATE / 1000
}
