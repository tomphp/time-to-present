use std::io;
use std::process::ExitCode;

fn main() -> ExitCode {
    match ttp_stt_sidecar::serve(&loader(), io::stdin().lock(), io::stdout().lock()) {
        true => ExitCode::SUCCESS,
        false => ExitCode::FAILURE,
    }
}

#[cfg(feature = "whisper")]
fn loader() -> ttp_stt_sidecar::whisper::WhisperLoader {
    ttp_stt_sidecar::whisper::WhisperLoader
}

#[cfg(not(feature = "whisper"))]
fn loader() -> ttp_stt_sidecar::NoEngine {
    ttp_stt_sidecar::NoEngine
}
