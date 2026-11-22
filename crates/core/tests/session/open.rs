use ttp_core::store::StoreError;

use crate::support::{Harness, word_starts};

#[test]
fn opening_a_presentation_publishes_its_title_and_words_at_their_script_times() {
    let (harness, folder) = Harness::with_fixture("hello-world");

    let state = harness.open(&folder).state();

    assert_eq!(state.title, "Hello world");
    assert_eq!(state.folder, folder);
    assert_eq!(
        word_starts(&state),
        [
            ("w1", "Hello,", 400),
            ("w2", "world.", 850),
            ("w3", "Typed", 1400)
        ]
    );
}

#[test]
fn script_end_is_the_later_of_the_last_word_end_and_the_last_named_event() {
    let (harness, folder) = Harness::with_fixture("hello-world");

    assert_eq!(harness.open(&folder).state().script_end, 2200);
}

#[test]
fn script_end_is_the_last_word_end_when_no_named_event_comes_after_it() {
    let (harness, folder) = Harness::with_fixture("spoken-only");

    assert_eq!(harness.open(&folder).state().script_end, 850);
}

#[test]
fn a_folder_without_presentation_json_is_not_a_presentation() {
    let harness = Harness::new();
    let folder = harness.parent().join("holiday photos");
    std::fs::create_dir(&folder).unwrap();

    let error = harness.open_error(&folder);

    assert!(matches!(error, StoreError::NotAPresentation(ref f) if *f == folder));
}

#[test]
fn a_presentation_written_by_a_newer_version_is_refused() {
    let (harness, folder) = Harness::with_fixture("from-the-future");

    let error = harness.open_error(&folder);

    assert!(matches!(
        error,
        StoreError::NewerFormat {
            found: 2,
            supported: 1
        }
    ));
}

#[test]
fn a_stored_word_shorter_than_the_spoken_minimum_opens_unchanged() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let file = folder.join("presentation.json");
    let stored = std::fs::read_to_string(&file).unwrap().replace(
        r#""duration":300,"recordingId":"r1","audioStart":1200,"audioEnd":1500"#,
        r#""duration":0,"recordingId":"r1","audioStart":1200,"audioEnd":1200"#,
    );
    assert!(stored.contains(r#""duration":0,"#));
    std::fs::write(&file, &stored).unwrap();

    let state = harness.open(&folder).state();

    let hello = &state.words[0].word;
    assert_eq!(
        (hello.duration, hello.audio_start, hello.audio_end),
        (0, Some(1200), Some(1200))
    );
    assert_eq!(word_starts(&state)[1], ("w2", "world.", 550));
    assert_eq!(std::fs::read_to_string(&file).unwrap(), stored);
}
