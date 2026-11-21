use serde_json::{Value, json};
use tempfile::TempDir;

use crate::support::*;

fn only_error(out: &Output) -> String {
    assert_eq!(out.events.len(), 1, "{:?}", out.events);
    closing_error(out)
}

fn live_error(requests: &[Value]) -> String {
    let dir = TempDir::new().unwrap();
    let mut all = vec![live(&model(&dir))];
    all.extend_from_slice(requests);
    let out = sidecar(&all);
    assert_eq!(out.events[0], ready());
    closing_error(&out)
}

#[test]
fn a_live_session_in_a_language_other_than_english_is_refused() {
    let dir = TempDir::new().unwrap();
    let mut request = live(&model(&dir));
    request["language"] = json!("de");

    let message = only_error(&sidecar(&[request]));

    assert_eq!(
        message,
        "unsupported language \"de\": only \"en\" is available"
    );
}

#[test]
fn a_transcription_in_a_language_other_than_english_is_refused() {
    let dir = TempDir::new().unwrap();
    let recording = wav(&dir, &[word(1, 300)]);
    let mut request = transcribe(&model(&dir), &recording);
    request["language"] = json!("fr");

    let out = sidecar(&[request]);

    assert_eq!(
        out.events,
        [
            json!({"type": "error", "message": "unsupported language \"fr\": only \"en\" is available"})
        ]
    );
    assert!(!out.success);
}

#[test]
fn a_line_that_is_not_json_is_an_error() {
    let message = only_error(&sidecar_raw("not json\n"));

    assert!(message.starts_with("malformed request: "), "{message}");
}

#[test]
fn an_unknown_request_is_an_error() {
    let message = only_error(&sidecar(&[json!({"type": "translate"})]));

    assert!(
        message.starts_with("malformed request: unknown variant `translate`"),
        "{message}"
    );
}

#[test]
fn closing_stdin_before_any_request_is_an_error() {
    assert_eq!(only_error(&sidecar_raw("")), "no request was sent");
}

#[test]
fn a_missing_model_is_an_error_before_ready() {
    let dir = TempDir::new().unwrap();
    let recording = wav(&dir, &[word(1, 300)]);
    let missing = dir.path().join("ggml-missing.bin");

    let message = only_error(&sidecar(&[transcribe(&missing, &recording)]));

    assert!(
        message.starts_with(&format!(
            "could not load the speech model {}: ",
            missing.display()
        )),
        "{message}"
    );
}

#[test]
fn an_unreadable_recording_is_an_error_after_ready() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("missing.wav");

    let out = sidecar(&[transcribe(&model(&dir), &missing)]);

    assert_eq!(out.events.len(), 2);
    assert_eq!(out.events[0], ready());
    let message = closing_error(&out);
    assert!(
        message.starts_with(&format!(
            "could not read the recording {}: ",
            missing.display()
        )),
        "{message}"
    );
}

#[test]
fn audio_before_a_live_request_is_an_error() {
    let message = only_error(&sidecar(&[audio(&[word(1, 500)])]));

    assert_eq!(message, "the first request must be live or transcribe");
}

#[test]
fn audio_that_is_not_base64_is_an_error() {
    let message = live_error(&[json!({"type": "audio", "pcm": "not base64!"})]);

    assert!(message.starts_with("audio is not base64: "), "{message}");
}

#[test]
fn audio_that_splits_a_sample_is_an_error() {
    let message = live_error(&[json!({"type": "audio", "pcm": "AAAA"})]);

    assert_eq!(message, "audio must be whole 16-bit samples");
}

#[test]
fn a_second_session_request_during_a_live_session_is_an_error() {
    let dir = TempDir::new().unwrap();

    let message = live_error(&[live(&model(&dir))]);

    assert_eq!(message, "a live session takes only audio requests");
}

#[test]
fn an_engine_failure_mid_session_is_an_error_after_the_words_so_far() {
    let dir = TempDir::new().unwrap();

    let out = sidecar(&[
        live(&model(&dir)),
        audio(&[word(1, 300), silence(200)]),
        audio(&[word(-1, 500)]),
    ]);

    assert_eq!(
        out.events,
        [
            ready(),
            json!({"type": "words", "from": 0, "stable": 0, "words": [heard("w1", 0, 300)]}),
            json!({"type": "error", "message": "the fake engine was told to fail"}),
        ]
    );
    assert!(!out.success);
}
