use ttp_core::capture::InputChoice;
use ttp_core::session::{InsertionPoint, Session, SessionState};
use ttp_core::time::Ms;

use crate::support::{Harness, starts};

fn landed(start: impl FnOnce(&mut Session), heard: &[(&str, Ms, Ms)]) -> SessionState {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.open_recording_bar(InputChoice::default());
    start(&mut session);
    harness.audio.play(&[0.1; 480]);
    session.stop_recording().unwrap();
    harness.transcriber.hear(heard);
    session.poll().unwrap();
    session.state()
}

fn landed_before_world(heard: &[(&str, Ms, Ms)]) -> SessionState {
    let before = InsertionPoint {
        before: Some("w2".into()),
    };
    landed(|session| session.start_recording(before).unwrap(), heard)
}

fn re_recorded_over_world(heard: &[(&str, Ms, Ms)]) -> SessionState {
    let world = ["w2".into()];
    landed(|session| session.start_re_recording(&world).unwrap(), heard)
}

/// The landed Word at `index`: its Gap, duration and audio.
fn timing(state: &SessionState, index: usize) -> (Ms, Ms, Option<Ms>, Option<Ms>) {
    let word = &state.words[index].word;
    (word.gap, word.duration, word.audio_start, word.audio_end)
}

#[test]
fn every_landed_word_lasts_at_least_80_ms_and_its_duration_spans_its_audio() {
    let state = landed_before_world(&[
        ("one", 500, 500),
        ("two", 520, 530),
        ("three", 540, 540),
        ("four", 1_000, 1_010),
    ]);

    for index in 1..5 {
        let (_, duration, start, end) = timing(&state, index);
        assert!(duration >= 80, "{:?}", state.words[index].word);
        assert_eq!(
            Some(duration),
            end.zip(start).map(|(end, start)| end - start)
        );
    }
}

#[test]
fn a_short_word_with_silence_after_it_grows_into_it_and_later_words_keep_their_script_times() {
    let state = landed_before_world(&[("brave", 500, 800), ("a", 900, 920), ("new", 1_100, 1_300)]);

    assert_eq!(
        starts(&state),
        [
            ("Hello,", 400),
            ("brave", 850),
            ("a", 1_250),
            ("new", 1_450),
            ("world.", 1_800),
            ("Typed", 2_350)
        ]
    );
    assert_eq!(timing(&state, 2), (100, 80, Some(900), Some(980)));
    assert_eq!(state.words[3].word.gap, 120);
}

#[test]
fn a_short_word_with_silence_only_before_it_grows_earlier_and_its_gap_shrinks_to_match() {
    let state = landed_before_world(&[("brave", 500, 800), ("a", 900, 920), ("new", 920, 1_100)]);

    assert_eq!(starts(&state)[2..4], [("a", 1_190), ("new", 1_270)]);
    assert_eq!(timing(&state, 2), (40, 80, Some(840), Some(920)));
}

#[test]
fn a_short_first_word_into_an_empty_script_grows_earlier_and_its_lead_in_shrinks_to_match() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    session.open_recording_bar(InputChoice::default());
    session.start_recording(InsertionPoint::default()).unwrap();
    harness.audio.play(&[0.1; 480]);
    session.stop_recording().unwrap();

    harness
        .transcriber
        .hear(&[("Hi", 700, 720), ("there", 720, 900)]);
    session.poll().unwrap();

    let state = session.state();
    assert_eq!(starts(&state), [("Hi", 640), ("there", 720)]);
    assert_eq!(timing(&state, 0), (640, 80, Some(640), Some(720)));
}

#[test]
fn a_packed_short_word_zeroes_the_next_gap_and_moves_later_words_on_by_the_shortfall() {
    let state = landed_before_world(&[
        ("brave", 500, 860),
        ("a", 870, 890),
        ("new", 890, 1_100),
        ("day", 1_200, 1_400),
    ]);

    assert_eq!(
        starts(&state)[1..6],
        [
            ("brave", 850),
            ("a", 1_210),
            ("new", 1_290),
            ("day", 1_600),
            ("world.", 1_950)
        ]
    );
    assert_eq!(timing(&state, 2), (0, 80, Some(860), Some(940)));
    assert_eq!(timing(&state, 3), (0, 210, Some(890), Some(1_100)));
}

#[test]
fn a_short_word_in_a_re_record_grows_into_the_silence_around_it() {
    let state = re_recorded_over_world(&[
        ("big", 1_000, 1_300),
        ("a", 1_400, 1_410),
        ("planet.", 1_450, 1_800),
    ]);

    assert_eq!(
        starts(&state),
        [
            ("Hello,", 400),
            ("big", 850),
            ("a", 1_220),
            ("planet.", 1_300),
            ("Typed", 1_750)
        ]
    );
    assert_eq!(timing(&state, 2), (70, 80, Some(1_370), Some(1_450)));
}

#[test]
fn a_packed_short_word_in_a_re_record_pushes_on_and_a_short_word_after_it_still_grows() {
    let state = re_recorded_over_world(&[
        ("big", 1_000, 1_360),
        ("a", 1_370, 1_390),
        ("b", 1_390, 1_400),
        ("planet.", 1_500, 1_800),
    ]);

    assert_eq!(
        starts(&state),
        [
            ("Hello,", 400),
            ("big", 850),
            ("a", 1_210),
            ("b", 1_290),
            ("planet.", 1_400),
            ("Typed", 1_800)
        ]
    );
    assert_eq!(timing(&state, 2), (0, 80, Some(1_360), Some(1_440)));
    assert_eq!(timing(&state, 3), (0, 80, Some(1_390), Some(1_470)));
    assert_eq!(state.words[4].word.gap, 30);
}
