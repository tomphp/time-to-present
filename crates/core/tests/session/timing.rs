use ttp_core::script::Edit;
use ttp_core::session::Session;

use crate::support::{Harness, starts};

fn moved(word: &str, by: i64) -> Edit {
    Edit::Move {
        word: word.into(),
        by,
    }
}

fn hello_world() -> (Harness, Session) {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let session = harness.open(&folder);
    (harness, session)
}

#[test]
fn moving_a_word_changes_its_gap_and_ripples_everything_after() {
    let (_harness, mut session) = hello_world();

    session.edit(moved("w2", 250)).unwrap();

    let state = session.state();
    assert_eq!(
        starts(&state),
        [("Hello,", 400), ("world.", 1100), ("Typed", 1650)]
    );
    assert_eq!(state.words[1].word.gap, 400);
}

#[test]
fn moving_a_word_earlier_stops_at_the_end_of_the_word_before() {
    let (_harness, mut session) = hello_world();

    session.edit(moved("w2", -500)).unwrap();

    assert_eq!(
        starts(&session.state()),
        [("Hello,", 400), ("world.", 700), ("Typed", 1250)]
    );
}

fn trimmed_start(word: &str, by: i64) -> Edit {
    Edit::TrimStart {
        word: word.into(),
        by,
    }
}

fn trimmed_end(word: &str, by: i64) -> Edit {
    Edit::TrimEnd {
        word: word.into(),
        by,
    }
}

fn timing(session: &Session, index: usize) -> (i64, i64, Option<i64>, Option<i64>) {
    let word = &session.state().words[index].word;
    (word.gap, word.duration, word.audio_start, word.audio_end)
}

#[test]
fn trimming_a_words_start_cuts_into_its_audio_and_moves_nothing_after() {
    let (_harness, mut session) = hello_world();

    session.edit(trimmed_start("w2", 100)).unwrap();

    assert_eq!(timing(&session, 1), (250, 350, Some(1750), Some(2100)));
    assert_eq!(
        starts(&session.state()),
        [("Hello,", 400), ("world.", 950), ("Typed", 1400)]
    );
}

#[test]
fn trimming_a_words_start_earlier_uses_more_of_its_audio_up_to_the_word_before() {
    let (_harness, mut session) = hello_world();

    session.edit(trimmed_start("w2", -400)).unwrap();

    assert_eq!(timing(&session, 1), (0, 600, Some(1500), Some(2100)));
}

#[test]
fn trimming_a_words_start_earlier_stops_at_the_start_of_its_recording() {
    let (_harness, mut session) = hello_world();
    session.edit(moved("w1", 1000)).unwrap();

    session.edit(trimmed_start("w1", -1400)).unwrap();

    assert_eq!(timing(&session, 0), (200, 1500, Some(0), Some(1500)));
}

#[test]
fn trimming_a_words_start_past_its_end_leaves_the_shortest_word() {
    let (_harness, mut session) = hello_world();

    session.edit(trimmed_start("w2", 1000)).unwrap();

    assert_eq!(timing(&session, 1), (590, 10, Some(2090), Some(2100)));
    assert_eq!(starts(&session.state())[2], ("Typed", 1400));
}

#[test]
fn trimming_a_words_end_extends_its_audio_and_ripples_everything_after() {
    let (_harness, mut session) = hello_world();

    session.edit(trimmed_end("w2", 100)).unwrap();

    assert_eq!(timing(&session, 1), (150, 550, Some(1650), Some(2200)));
    assert_eq!(starts(&session.state())[2], ("Typed", 1500));
}

#[test]
fn trimming_a_words_end_past_its_start_leaves_the_shortest_word() {
    let (_harness, mut session) = hello_world();

    session.edit(trimmed_end("w2", -1000)).unwrap();

    assert_eq!(timing(&session, 1), (150, 10, Some(1650), Some(1660)));
    assert_eq!(starts(&session.state())[2], ("Typed", 960));
}

#[test]
fn trimming_a_typed_word_changes_its_timing_only() {
    let (_harness, mut session) = hello_world();

    session.edit(trimmed_start("w3", 50)).unwrap();
    session.edit(trimmed_end("w3", 200)).unwrap();

    assert_eq!(timing(&session, 2), (150, 450, None, None));
}

#[test]
fn moving_or_trimming_an_unknown_word_changes_nothing() {
    let (_harness, mut session) = hello_world();
    let before = session.state();

    for edit in [
        moved("w9", 10),
        trimmed_start("w9", 10),
        trimmed_end("w9", 10),
    ] {
        assert!(session.edit(edit).is_err());
    }

    assert_eq!(session.state(), before);
}

#[test]
fn named_events_move_with_the_words_they_are_anchored_to_as_timing_ripples() {
    let (_harness, mut session) = hello_world();

    session.edit(moved("w2", 250)).unwrap();

    let times: Vec<_> = session
        .state()
        .named_events
        .iter()
        .map(|timed| (timed.event.name.clone(), timed.time))
        .collect();
    assert_eq!(times, [("slide".into(), 0), ("confetti".into(), 2450)]);
}

#[test]
fn trimming_a_words_start_moves_the_events_anchored_to_it_with_its_start() {
    let (_harness, mut session) = hello_world();

    session.edit(trimmed_start("w3", 50)).unwrap();

    let confetti = &session.state().named_events[1];
    assert_eq!((confetti.event.offset, confetti.time), (800, 2250));
}
