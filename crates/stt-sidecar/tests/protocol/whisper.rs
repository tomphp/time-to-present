//! Opt-in: real whisper.cpp on a spoken fixture. Run with
//! `cargo test -p ttp-stt-sidecar --features whisper -- --ignored`. The model is
//! `TTP_WHISPER_MODEL`, or the base.en the app downloads.

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::support::*;

const SIDECAR: &str = env!("CARGO_BIN_EXE_ttp-stt-sidecar");
const SPOKEN: [&str; 9] = [
    "the", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog",
];

fn whisper_model() -> PathBuf {
    let model = std::env::var_os("TTP_WHISPER_MODEL")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(&std::env::var_os("HOME").unwrap()).join(
                "Library/Application Support/dev.timetopresent.desktop/models/ggml-base.en.bin",
            )
        });
    assert!(
        model.exists(),
        "no whisper model at {}; set TTP_WHISPER_MODEL",
        model.display()
    );
    model
}

fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/quick-brown-fox.wav")
}

fn texts(words: &[Value]) -> Vec<String> {
    words
        .iter()
        .map(|word| {
            word["text"]
                .as_str()
                .unwrap()
                .trim_matches(|c: char| !c.is_alphanumeric())
                .to_lowercase()
        })
        .collect()
}

#[test]
#[ignore = "slow: runs real whisper.cpp"]
fn whisper_transcribes_a_spoken_fixture_into_timed_words() {
    let out = run(SIDECAR, &[transcribe(&whisper_model(), &fixture())]);

    assert!(out.success, "{:?}", out.events);
    let words = out
        .events
        .iter()
        .find(|event| event["type"] == "words")
        .unwrap();
    let words = words["words"].as_array().unwrap();
    assert_eq!(texts(words), SPOKEN);
    let times: Vec<u64> = words
        .iter()
        .flat_map(|word| {
            [
                word["start"].as_u64().unwrap(),
                word["end"].as_u64().unwrap(),
            ]
        })
        .collect();
    assert!(times.is_sorted(), "{times:?}");
    assert!(
        times.chunks(2).all(|word| word[1] > word[0]),
        "every Word ends after it starts: {times:?}"
    );
    assert!(*times.last().unwrap() <= 2900, "{times:?}");
    assert!(out.events.iter().any(|event| event["type"] == "progress"));
}
