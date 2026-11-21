use serde_json::json;
use tempfile::TempDir;

use crate::support::*;

#[test]
fn a_live_session_shows_words_as_they_are_heard_and_settles_them_when_stdin_closes() {
    let dir = TempDir::new().unwrap();

    let out = sidecar(&[
        live(&model(&dir)),
        audio(&[silence(200), word(1, 300)]),
        audio(&[silence(500)]),
    ]);

    assert_eq!(
        out.events,
        [
            ready(),
            json!({"type": "words", "from": 0, "stable": 0, "words": [heard("w1", 200, 500)]}),
            json!({"type": "words", "from": 1, "stable": 1, "words": []}),
            done(),
        ]
    );
    assert!(out.success);
}

#[test]
fn a_word_still_being_spoken_is_revised_as_more_of_it_is_heard() {
    let dir = TempDir::new().unwrap();

    let out = sidecar(&[
        live(&model(&dir)),
        audio(&[silence(200), word(1, 300)]),
        audio(&[word(1, 200), silence(100), word(2, 200)]),
    ]);

    assert_eq!(
        out.events[1..3],
        [
            json!({"type": "words", "from": 0, "stable": 0, "words": [heard("w1", 200, 500)]}),
            json!({"type": "words", "from": 0, "stable": 0, "words": [
                heard("w1", 200, 700),
                heard("w2", 800, 1000),
            ]}),
        ]
    );
}

#[test]
fn audio_shorter_than_a_step_waits_for_the_rest_of_the_step() {
    let dir = TempDir::new().unwrap();

    let out = sidecar(&[
        live(&model(&dir)),
        audio(&[word(1, 200)]),
        audio(&[word(1, 100), silence(200)]),
    ]);

    assert_eq!(
        out.events[1],
        json!({"type": "words", "from": 0, "stable": 0, "words": [heard("w1", 0, 300)]})
    );
}

#[test]
fn once_the_window_is_full_words_a_second_behind_settle_and_the_window_slides_past_them() {
    let dir = TempDir::new().unwrap();
    let mut requests = vec![live(&model(&dir))];
    requests.extend((1..=11).map(|n| audio(&[word(n, 300), silence(200)])));

    let out = sidecar(&requests);

    let at = |n: u64| heard(&format!("w{n}"), (n - 1) * 500, (n - 1) * 500 + 300);
    assert_eq!(
        out.events[9..],
        [
            json!({"type": "words", "from": 8, "stable": 0, "words": [at(9)]}),
            json!({"type": "words", "from": 9, "stable": 8, "words": [at(10)]}),
            json!({"type": "words", "from": 10, "stable": 8, "words": [at(11)]}),
            json!({"type": "words", "from": 11, "stable": 11, "words": []}),
            done(),
        ]
    );
}

#[test]
fn a_long_silence_slides_the_window_without_losing_later_words() {
    let dir = TempDir::new().unwrap();
    let mut requests = vec![live(&model(&dir))];
    requests.extend((0..12).map(|_| audio(&[silence(500)])));
    requests.push(audio(&[word(1, 300), silence(200)]));

    let out = sidecar(&requests);

    assert_eq!(
        out.events[1..],
        [
            json!({"type": "words", "from": 0, "stable": 0, "words": [heard("w1", 6000, 6300)]}),
            json!({"type": "words", "from": 1, "stable": 1, "words": []}),
            done(),
        ]
    );
}

#[test]
fn a_live_session_that_hears_only_silence_reports_no_speech() {
    let dir = TempDir::new().unwrap();

    let out = sidecar(&[live(&model(&dir)), audio(&[silence(1500)])]);

    assert_eq!(out.events, [ready(), no_speech(), done()]);
    assert!(out.success);
}

#[test]
fn a_live_session_closed_before_any_audio_reports_no_speech() {
    let dir = TempDir::new().unwrap();

    let out = sidecar(&[live(&model(&dir))]);

    assert_eq!(out.events, [ready(), no_speech(), done()]);
}
