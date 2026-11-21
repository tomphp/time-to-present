use ttp_core::script::Edit;

use crate::support::{Harness, starts};

fn last_id(session: &ttp_core::session::Session) -> String {
    session.state().words.last().unwrap().word.id.clone()
}

fn insert(session: &mut ttp_core::session::Session, after: Option<&str>, text: &str) {
    session
        .edit(Edit::InsertWord {
            after: after.map(str::to_string),
            text: text.into(),
        })
        .unwrap();
}

#[test]
fn a_typed_word_between_two_words_takes_the_next_words_gap_which_then_gets_the_median_gap() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    insert(&mut session, Some("w1"), "big");

    let state = session.state();
    assert_eq!(
        starts(&state),
        [
            ("Hello,", 400),
            ("big", 850),
            ("world.", 1188),
            ("Typed", 1738)
        ]
    );
    let typed = &state.words[1].word;
    assert_eq!((typed.gap, typed.duration), (150, 188));
    assert_eq!(state.words[2].word.gap, 150);
    assert_eq!(
        (
            typed.recording_id.as_deref(),
            typed.audio_start,
            typed.audio_end,
            typed.confidence
        ),
        (None, None, None, None)
    );
}

#[test]
fn a_typed_words_duration_is_its_length_times_the_median_ms_per_character_clamped_to_150_to_1500() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    insert(&mut session, Some("w3"), "Hi");
    let hi = last_id(&session);
    insert(&mut session, Some(&hi), "Presentation");
    let presentation = last_id(&session);
    insert(
        &mut session,
        Some(&presentation),
        "Supercalifragilisticexpialidocious",
    );

    let state = session.state();
    let durations: Vec<_> = state.words[3..].iter().map(|w| w.word.duration).collect();
    assert_eq!(durations, [150, 750, 1500]);
}

#[test]
fn a_typed_word_at_the_end_gets_the_median_gap() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    insert(&mut session, Some("w3"), "end");

    let state = session.state();
    assert_eq!(state.words[3].word.gap, 150);
    assert_eq!(state.words[3].start, 1850);
}

#[test]
fn a_typed_word_at_the_start_takes_the_lead_in_and_the_old_first_word_gets_the_median_gap() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    insert(&mut session, None, "Well,");

    let state = session.state();
    assert_eq!(starts(&state)[..2], [("Well,", 400), ("Hello,", 863)]);
    assert_eq!(state.words[1].word.id, "w1");
    assert_eq!(state.words[1].word.gap, 150);
}

#[test]
fn without_spoken_words_a_typed_word_lasts_300_ms_and_gets_a_100_ms_gap_after_the_first() {
    let harness = Harness::new();
    let mut session = harness.create("Draft");

    insert(&mut session, None, "First");
    let first = session.state().words[0].word.id.clone();
    insert(&mut session, Some(&first), "second");

    let state = session.state();
    assert_eq!(starts(&state), [("First", 0), ("second", 400)]);
    assert_eq!(state.words[1].word.duration, 300);
}

#[test]
fn a_typed_word_must_be_one_word() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    let error = session
        .edit(Edit::InsertWord {
            after: Some("w1".into()),
            text: "two words".into(),
        })
        .unwrap_err();

    assert_eq!(
        error,
        ttp_core::script::EditError::NotOneWord("two words".into())
    );
}
