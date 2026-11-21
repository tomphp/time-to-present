use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};
use tempfile::TempDir;

const RATE: u32 = 16_000;

/// A stretch of fixture audio. The fake engine hears each run of one non-zero
/// sample value as the Word `w<value>`, and zero as silence.
pub struct Run {
    value: i16,
    ms: u32,
}

pub fn silence(ms: u32) -> Run {
    Run { value: 0, ms }
}

pub fn word(value: i16, ms: u32) -> Run {
    Run { value, ms }
}

pub fn samples(runs: &[Run]) -> Vec<i16> {
    runs.iter()
        .flat_map(|run| std::iter::repeat_n(run.value, (run.ms * RATE / 1000) as usize))
        .collect()
}

pub fn wav(dir: &TempDir, runs: &[Run]) -> PathBuf {
    wav_as(dir, runs, RATE, 16)
}

pub fn wav_as(dir: &TempDir, runs: &[Run], rate: u32, bits: u16) -> PathBuf {
    let path = dir.path().join(format!("recording-{rate}-{bits}.wav"));
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: rate,
        bits_per_sample: bits,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(&path, spec).unwrap();
    for run in runs {
        for _ in 0..(run.ms * rate / 1000) {
            writer
                .write_sample(i32::from(run.value) << (bits - 16))
                .unwrap();
        }
    }
    writer.finalize().unwrap();
    path
}

pub fn model(dir: &TempDir) -> PathBuf {
    let path = dir.path().join("ggml-fake.bin");
    std::fs::write(&path, b"fake").unwrap();
    path
}

pub fn transcribe(model: &Path, audio: &Path) -> Value {
    json!({"type": "transcribe", "model": model, "language": "en", "path": audio})
}

pub fn live(model: &Path) -> Value {
    json!({"type": "live", "model": model, "language": "en"})
}

pub fn audio(runs: &[Run]) -> Value {
    let bytes: Vec<u8> = samples(runs).iter().flat_map(|s| s.to_le_bytes()).collect();
    json!({"type": "audio", "pcm": STANDARD.encode(bytes)})
}

pub fn spoken(text: &str, start: u64, end: u64) -> Value {
    json!({"text": text, "start": start, "end": end, "confidence": 1.0})
}

pub struct Output {
    pub events: Vec<Value>,
    pub success: bool,
}

pub const FAKE: &str = env!("CARGO_BIN_EXE_ttp-stt-fake");

pub fn sidecar(requests: &[Value]) -> Output {
    run(FAKE, requests)
}

pub fn sidecar_raw(stdin: &str) -> Output {
    run_raw(FAKE, stdin)
}

pub fn run(binary: &str, requests: &[Value]) -> Output {
    let stdin: String = requests.iter().map(|r| format!("{r}\n")).collect();
    run_raw(binary, &stdin)
}

fn run_raw(binary: &str, stdin: &str) -> Output {
    let mut child = Command::new(binary)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(stdin.as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    let stdout = String::from_utf8(output.stdout).unwrap();
    Output {
        events: stdout
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect(),
        success: output.status.success(),
    }
}
