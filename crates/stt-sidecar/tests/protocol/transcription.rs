use serde_json::json;
use tempfile::TempDir;

use crate::support::*;

#[test]
fn a_transcription_reports_progress_then_timed_words_then_done() {
    let dir = TempDir::new().unwrap();
    let recording = wav(
        &dir,
        &[silence(200), word(1, 300), silence(100), word(2, 400)],
    );

    let out = sidecar(&[transcribe(&model(&dir), &recording)]);

    assert_eq!(
        out.events,
        [
            json!({"type": "ready", "protocol": 1}),
            json!({"type": "progress", "percent": 50}),
            json!({"type": "progress", "percent": 100}),
            json!({"type": "words", "from": 0, "stable": 2, "words": [
                spoken("w1", 200, 500),
                spoken("w2", 600, 1000),
            ]}),
            json!({"type": "done"}),
        ]
    );
    assert!(out.success);
}

#[test]
fn a_silent_recording_reports_no_speech() {
    let dir = TempDir::new().unwrap();
    let recording = wav(&dir, &[silence(1000)]);

    let out = sidecar(&[transcribe(&model(&dir), &recording)]);

    assert_eq!(
        out.events,
        [
            json!({"type": "ready", "protocol": 1}),
            json!({"type": "no_speech"}),
            json!({"type": "done"}),
        ]
    );
    assert!(out.success);
}

#[test]
fn a_recording_at_its_native_rate_and_depth_is_heard_at_16_khz() {
    let dir = TempDir::new().unwrap();
    let runs = [silence(200), word(1, 300), silence(100), word(2, 400)];
    let recording = wav_as(&dir, &runs, 48_000, 24);

    let out = sidecar(&[transcribe(&model(&dir), &recording)]);

    assert_eq!(
        out.events[out.events.len() - 2],
        json!({"type": "words", "from": 0, "stable": 2, "words": [
            spoken("w1", 200, 500),
            spoken("w2", 600, 1000),
        ]})
    );
}
