use std::path::Path;
use std::sync::{Arc, Mutex, mpsc};
use std::thread;

use whisper_rs::{
    DtwMode, DtwModelPreset, FullParams, SamplingStrategy, WhisperContext,
    WhisperContextParameters, WhisperSegment, WhisperState, WhisperTokenId,
};

use crate::engine::{Engine, Loader, Mode, Word};

/// whisper.cpp through whisper-rs. The live pass decodes each window on its
/// own with plain token timestamps; a Transcription adds DTW token timing when
/// the model has an alignment-head preset.
pub struct WhisperLoader;

impl Loader for WhisperLoader {
    fn load(&self, model: &Path, language: &str, mode: Mode) -> Result<Box<dyn Engine>, String> {
        let path = model.to_str().ok_or("the model path is not UTF-8")?;
        let mut params = WhisperContextParameters::default();
        if let (Mode::Transcription, Some(model_preset)) = (mode, dtw_preset(model)) {
            params.dtw_parameters.mode = DtwMode::ModelPreset { model_preset };
        }
        let context = WhisperContext::new_with_params(path, params).map_err(|e| e.to_string())?;
        Ok(Box::new(Whisper {
            end_of_text: context.token_eot(),
            state: context.create_state().map_err(|e| e.to_string())?,
            language: language.to_owned(),
            mode,
        }))
    }
}

struct Whisper {
    state: WhisperState,
    end_of_text: WhisperTokenId,
    language: String,
    mode: Mode,
}

impl Engine for Whisper {
    fn transcribe(
        &mut self,
        audio: &[f32],
        progress: &mut dyn FnMut(u8),
    ) -> Result<Vec<Word>, String> {
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some(&self.language));
        params.set_n_threads(threads());
        params.set_token_timestamps(true);
        params.set_suppress_nst(true);
        params.set_no_context(true);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_special(false);
        params.set_print_timestamps(false);
        params.set_single_segment(self.mode == Mode::Live);
        let state = &mut self.state;
        match self.mode {
            Mode::Live => state.full(params, audio),
            Mode::Transcription => full_with_progress(state, params, audio, progress),
        }
        .map_err(|e| e.to_string())?;
        Ok(words(state, self.end_of_text))
    }
}

/// FullParams never frees its progress closure, so the sender it holds is
/// taken back once decoding ends, which closes the channel.
fn full_with_progress(
    state: &mut WhisperState,
    mut params: FullParams,
    audio: &[f32],
    progress: &mut dyn FnMut(u8),
) -> Result<(), whisper_rs::WhisperError> {
    let (sender, receiver) = mpsc::channel();
    let slot = Arc::new(Mutex::new(Some(sender)));
    let reporter = Arc::clone(&slot);
    params.set_progress_callback_safe(move |percent: i32| {
        if let Some(sender) = &*reporter.lock().unwrap() {
            let _ = sender.send(percent.clamp(0, 100) as u8);
        }
    });
    thread::scope(|scope| {
        let decoding = scope.spawn(|| {
            let result = state.full(params, audio);
            slot.lock().unwrap().take();
            result
        });
        let mut reported = None;
        for percent in receiver {
            if reported.is_none_or(|last| percent > last) {
                progress(percent);
                reported = Some(percent);
            }
        }
        decoding.join().expect("decoding does not panic")
    })
}

fn words(state: &WhisperState, end_of_text: WhisperTokenId) -> Vec<Word> {
    let mut words: Vec<Spoken> = Vec::new();
    for segment in state.as_iter() {
        for token in tokens(&segment, end_of_text) {
            match words.last_mut() {
                Some(word) if !token.bytes.starts_with(b" ") => word.extend(token),
                _ => words.push(Spoken::from(token)),
            }
        }
    }
    words.into_iter().filter_map(Spoken::into_word).collect()
}

struct Token {
    bytes: Vec<u8>,
    start: i64,
    end: i64,
    probability: f32,
}

fn tokens(segment: &WhisperSegment, end_of_text: WhisperTokenId) -> Vec<Token> {
    (0..segment.n_tokens())
        .filter_map(|i| segment.get_token(i))
        .filter(|token| token.token_id() < end_of_text)
        .map(|token| {
            let data = token.token_data();
            Token {
                bytes: token.to_bytes().unwrap_or_default().to_vec(),
                start: if data.t_dtw >= 0 { data.t_dtw } else { data.t0 },
                end: data.t1,
                probability: data.p,
            }
        })
        .collect()
}

struct Spoken {
    bytes: Vec<u8>,
    start: i64,
    end: i64,
    probabilities: Vec<f32>,
}

impl From<Token> for Spoken {
    fn from(token: Token) -> Self {
        Self {
            bytes: token.bytes,
            start: token.start,
            end: token.end,
            probabilities: vec![token.probability],
        }
    }
}

impl Spoken {
    fn extend(&mut self, token: Token) {
        self.bytes.extend(token.bytes);
        self.end = token.end;
        self.probabilities.push(token.probability);
    }

    fn into_word(self) -> Option<Word> {
        let text = String::from_utf8_lossy(&self.bytes).trim().to_owned();
        if text.is_empty() || is_annotation(&text) {
            return None;
        }
        let centiseconds = |t: i64| t.max(0) as u64 * 10;
        Some(Word {
            text,
            start: centiseconds(self.start),
            end: centiseconds(self.end.max(self.start)),
            confidence: self.probabilities.iter().sum::<f32>() / self.probabilities.len() as f32,
        })
    }
}

fn is_annotation(text: &str) -> bool {
    (text.starts_with('[') && text.ends_with(']')) || (text.starts_with('(') && text.ends_with(')'))
}

fn dtw_preset(model: &Path) -> Option<DtwModelPreset> {
    let name = model.file_stem()?.to_str()?.strip_prefix("ggml-")?;
    let name = name.split_once("-q").map_or(name, |(base, _)| base);
    Some(match name {
        "tiny.en" => DtwModelPreset::TinyEn,
        "tiny" => DtwModelPreset::Tiny,
        "base.en" => DtwModelPreset::BaseEn,
        "base" => DtwModelPreset::Base,
        "small.en" => DtwModelPreset::SmallEn,
        "small" => DtwModelPreset::Small,
        "medium.en" => DtwModelPreset::MediumEn,
        "medium" => DtwModelPreset::Medium,
        "large-v1" => DtwModelPreset::LargeV1,
        "large-v2" => DtwModelPreset::LargeV2,
        "large-v3" => DtwModelPreset::LargeV3,
        "large-v3-turbo" => DtwModelPreset::LargeV3Turbo,
        _ => return None,
    })
}

fn threads() -> i32 {
    thread::available_parallelism().map_or(4, |n| n.get().min(8) as i32)
}
