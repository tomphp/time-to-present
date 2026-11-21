mod audio;
mod engine;
pub mod fake;
mod live;
mod protocol;
#[cfg(feature = "whisper")]
pub mod whisper;

use std::io::{BufRead, Write};
use std::path::Path;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;

pub use engine::{Engine, Loader, Mode, NoEngine, SAMPLE_RATE, Word};
use live::Live;
use protocol::{Event, Request};

const LANGUAGES: [&str; 1] = ["en"];

/// Speaks the sidecar protocol (see `docs/stt-sidecar-protocol.md`) for one
/// session, returning whether it ended without an error.
pub fn serve(loader: &dyn Loader, input: impl BufRead, output: impl Write) -> bool {
    let mut emit = emitter(output);
    match run(loader, input, &mut emit) {
        Ok(()) => true,
        Err(message) => {
            emit(Event::Error { message });
            false
        }
    }
}

fn emitter(mut output: impl Write) -> impl FnMut(Event) {
    move |event| {
        serde_json::to_writer(&mut output, &event).expect("stdout is writable");
        output.write_all(b"\n").expect("stdout is writable");
        output.flush().expect("stdout is writable");
    }
}

fn run(
    loader: &dyn Loader,
    input: impl BufRead,
    emit: &mut dyn FnMut(Event),
) -> Result<(), String> {
    let mut requests = input
        .lines()
        .map(|line| parse(&line.map_err(|e| e.to_string())?));
    match requests.next().ok_or("no request was sent")?? {
        Request::Live { model, language } => {
            let engine = load(loader, &model, &language, Mode::Live)?;
            listen(engine, requests, emit)
        }
        Request::Transcribe {
            model,
            language,
            path,
        } => {
            let engine = load(loader, &model, &language, Mode::Transcription)?;
            transcribe(engine, &path, emit)
        }
        Request::Audio { .. } => Err("the first request must be live or transcribe".into()),
    }
}

fn parse(line: &str) -> Result<Request, String> {
    serde_json::from_str(line).map_err(|e| format!("malformed request: {e}"))
}

fn load(
    loader: &dyn Loader,
    model: &Path,
    language: &str,
    mode: Mode,
) -> Result<Box<dyn Engine>, String> {
    check_language(language)?;
    loader
        .load(model, language, mode)
        .map_err(|e| format!("could not load the speech model {}: {e}", model.display()))
}

fn check_language(language: &str) -> Result<(), String> {
    if LANGUAGES.contains(&language) {
        Ok(())
    } else {
        Err(format!(
            "unsupported language \"{language}\": only \"en\" is available"
        ))
    }
}

fn listen(
    engine: Box<dyn Engine>,
    requests: impl Iterator<Item = Result<Request, String>>,
    emit: &mut dyn FnMut(Event),
) -> Result<(), String> {
    let mut live = Live::new(engine);
    emit(Event::Ready {
        protocol: protocol::VERSION,
    });
    for request in requests {
        let Request::Audio { pcm } = request? else {
            return Err("a live session takes only audio requests".into());
        };
        let pcm = STANDARD
            .decode(pcm)
            .map_err(|e| format!("audio is not base64: {e}"))?;
        if let Some(event) = live.hear(&audio::decode_pcm(&pcm)?)? {
            emit(event);
        }
    }
    if let Some(event) = live.finish()? {
        emit(event);
    }
    if live.heard_nothing() {
        emit(Event::NoSpeech);
    }
    emit(Event::Done);
    Ok(())
}

fn transcribe(
    mut engine: Box<dyn Engine>,
    path: &Path,
    emit: &mut dyn FnMut(Event),
) -> Result<(), String> {
    emit(Event::Ready {
        protocol: protocol::VERSION,
    });
    let audio = audio::read_wav(path)
        .map_err(|e| format!("could not read the recording {}: {e}", path.display()))?;
    let words = engine.transcribe(&audio, &mut |percent| emit(Event::Progress { percent }))?;
    if words.is_empty() {
        emit(Event::NoSpeech);
    } else {
        emit(Event::Words {
            from: 0,
            stable: words.len(),
            words,
        });
    }
    emit(Event::Done);
    Ok(())
}
