use ttp_core::script::{BreakAfter, Edit, EditError};

use crate::support::{Harness, starts};

fn split(session: &mut ttp_core::session::Session, word: &str, at: usize) {
    session
        .edit(Edit::Split {
            word: word.into(),
            at,
        })
        .unwrap();
}

#[test]
fn a_split_word_divides_its_duration_and_audio_by_character_count_and_the_new_word_has_no_gap() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    split(&mut session, "w2", 2);

    let state = session.state();
    assert_eq!(
        starts(&state),
        [
            ("Hello,", 400),
            ("wo", 850),
            ("rld.", 1000),
            ("Typed", 1400)
        ]
    );
    let (first, second) = (&state.words[1].word, &state.words[2].word);
    assert_eq!(first.id, "w2");
    assert!(!["w1", "w2", "w3", "e1", "e2"].contains(&second.id.as_str()));
    assert_eq!((first.gap, first.duration), (150, 150));
    assert_eq!((second.gap, second.duration), (0, 300));
    assert_eq!(
        (first.audio_start, first.audio_end),
        (Some(1650), Some(1800))
    );
    assert_eq!(
        (second.audio_start, second.audio_end),
        (Some(1800), Some(2100))
    );
    assert_eq!(second.recording_id.as_deref(), Some("r1"));
    assert_eq!((first.confidence, second.confidence), (None, None));
}

#[test]
fn a_split_moves_the_break_to_the_second_part() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    split(&mut session, "w2", 2);

    let state = session.state();
    assert_eq!(state.words[1].word.break_after, None);
    assert_eq!(state.words[2].word.break_after, Some(BreakAfter::Paragraph));
}

#[test]
fn a_split_typed_word_divides_its_duration_and_stays_typed() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    split(&mut session, "w3", 1);

    let state = session.state();
    let second = &state.words[3].word;
    assert_eq!((state.words[2].word.duration, second.duration), (60, 240));
    assert_eq!(
        (
            second.recording_id.as_deref(),
            second.audio_start,
            second.audio_end
        ),
        (None, None, None)
    );
}

#[test]
fn a_split_must_leave_text_on_both_sides() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    for at in [0, 6, 7] {
        let error = session
            .edit(Edit::Split {
                word: "w1".into(),
                at,
            })
            .unwrap_err();
        assert_eq!(error, EditError::InvalidSplit { at, length: 6 });
    }
}
