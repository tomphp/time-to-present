use ttp_core::script::{Edit, EditError};

use crate::support::Harness;

#[test]
fn retyping_a_word_keeps_its_timing_and_audio_and_clears_its_confidence() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let before = session.state().words[0].clone();

    session
        .edit(Edit::Correct {
            word: "w1".into(),
            text: "Hullo,".into(),
        })
        .unwrap();

    let after = &session.state().words[0];
    assert_eq!(after.word.text, "Hullo,");
    assert_eq!(after.word.id, before.word.id);
    assert_eq!(after.start, before.start);
    assert_eq!(after.word.gap, before.word.gap);
    assert_eq!(after.word.duration, before.word.duration);
    assert_eq!(after.word.recording_id, before.word.recording_id);
    assert_eq!(after.word.audio_start, before.word.audio_start);
    assert_eq!(after.word.audio_end, before.word.audio_end);
    assert_eq!(after.word.confidence, None);
}

#[test]
fn a_correction_needs_a_single_word_of_text() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    for text in ["", "two words", " "] {
        let error = session
            .edit(Edit::Correct {
                word: "w1".into(),
                text: text.into(),
            })
            .unwrap_err();
        assert!(matches!(error, EditError::NotOneWord(ref t) if t == text));
    }
    assert_eq!(session.state().words[0].word.text, "Hello,");
}

#[test]
fn an_edit_to_an_unknown_word_is_refused() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    let error = session
        .edit(Edit::Correct {
            word: "nope".into(),
            text: "x".into(),
        })
        .unwrap_err();

    assert!(matches!(error, EditError::UnknownWord(ref id) if id == "nope"));
}
