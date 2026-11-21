mod words;

use std::path::Path;
use std::sync::{Arc, Mutex, mpsc};
use std::thread;

use whisper_rs::{
    DtwMode, DtwModelPreset, FullParams, SamplingStrategy, WhisperContext,
    WhisperContextParameters, WhisperError, WhisperState, WhisperTokenId,
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
        if let Mode::Transcription { .. } = mode {
            match dtw_preset(model) {
                Some(model_preset) => {
                    params.dtw_parameters.mode = DtwMode::ModelPreset { model_preset }
                }
                None => eprintln!(
                    "ttp-stt-sidecar: no DTW alignment heads for {}; using plain token timestamps",
                    model.display()
                ),
            }
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
    fn recognise(
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
        let state = &mut self.state;
        match &self.mode {
            Mode::Live => {
                params.set_single_segment(true);
                state.full(params, audio)
            }
            Mode::Transcription { prompt } => {
                if let Some(prompt) = prompt {
                    params.set_initial_prompt(prompt);
                }
                full_with_progress(state, params, audio, progress)
            }
        }
        .map_err(|e| e.to_string())?;
        Ok(words::from_tokens(state, self.end_of_text))
    }
}

/// FullParams never frees its progress closure, so the sender it holds is
/// taken back once decoding ends, which closes the channel.
fn full_with_progress(
    state: &mut WhisperState,
    mut params: FullParams,
    audio: &[f32],
    progress: &mut dyn FnMut(u8),
) -> Result<(), WhisperError> {
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
        receiver.into_iter().for_each(&mut *progress);
        decoding.join().expect("decoding does not panic")
    })
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
