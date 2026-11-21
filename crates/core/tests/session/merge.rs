use ttp_core::script::{BreakAfter, Edit, EditError};

use crate::support::{Harness, word_starts};

#[test]
fn merging_keeps_the_first_words_id_gap_and_audio_start_and_spans_to_the_second_words_end() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.edit(Edit::Merge { word: "w1".into() }).unwrap();

    let state = session.state();
    assert_eq!(
        word_starts(&state),
        [("w1", "Hello,world.", 400), ("w3", "Typed", 1400)]
    );
    let merged = &state.words[0].word;
    assert_eq!((merged.gap, merged.duration), (400, 900));
    assert_eq!(
        (merged.audio_start, merged.audio_end),
        (Some(1200), Some(2100))
    );
    assert_eq!(merged.confidence, None);
    assert_eq!(merged.break_after, Some(BreakAfter::Paragraph));
}

#[test]
fn merging_a_spoken_word_with_a_typed_one_keeps_the_spoken_audio_range() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.edit(Edit::Merge { word: "w2".into() }).unwrap();

    let state = session.state();
    let merged = &state.words[1].word;
    assert_eq!(merged.text, "world.Typed");
    assert_eq!(merged.duration, 850);
    assert_eq!(
        (merged.audio_start, merged.audio_end),
        (Some(1650), Some(2100))
    );
}

#[test]
fn the_last_word_has_nothing_to_merge_with() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    let error = session.edit(Edit::Merge { word: "w3".into() }).unwrap_err();

    assert_eq!(error, EditError::NothingAfter("w3".into()));
}
