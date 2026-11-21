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
            ready(),
            json!({"type": "progress", "percent": 50}),
            json!({"type": "progress", "percent": 100}),
            json!({"type": "words", "from": 0, "stable": 2, "words": [
                heard("w1", 200, 500),
                heard("w2", 600, 1000),
            ]}),
            done(),
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
            ready(),
            json!({"type": "progress", "percent": 100}),
            no_speech(),
            done()
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
            heard("w1", 200, 500),
            heard("w2", 600, 1000),
        ]})
    );
}

#[test]
fn a_stereo_float_recording_is_mixed_down_to_mono() {
    let dir = TempDir::new().unwrap();
    let recording = stereo_float_wav(&dir, &[silence(100), word(3, 400)], 44_100);

    let out = sidecar(&[transcribe(&model(&dir), &recording)]);

    assert_eq!(
        out.events[out.events.len() - 2],
        json!({"type": "words", "from": 0, "stable": 1, "words": [heard("w3", 100, 500)]})
    );
}

#[test]
fn a_transcription_can_be_prompted_with_the_text_it_should_expect() {
    let dir = TempDir::new().unwrap();
    let recording = wav(&dir, &[word(1, 300)]);
    let mut request = transcribe(&model(&dir), &recording);
    request["prompt"] = json!("The quick brown fox.");

    let out = sidecar(&[request]);

    assert!(out.success, "{:?}", out.events);
    assert_eq!(out.events.last().unwrap(), &done());
}
