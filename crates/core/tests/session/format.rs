use std::fs;

use ttp_core::store::{self, StoreError};

use crate::support::{Harness, word_starts};

#[test]
fn a_saved_presentation_is_pretty_printed_with_one_word_per_line() {
    let (harness, fixture) = Harness::with_fixture("hello-world");
    let presentation = store::open(&fixture).unwrap();
    let folder = harness.parent().join("saved");
    fs::create_dir(&folder).unwrap();

    store::save(&folder, &presentation).unwrap();

    assert_eq!(
        fs::read_to_string(folder.join("presentation.json")).unwrap(),
        fs::read_to_string(fixture.join("presentation.json")).unwrap()
    );
}

#[test]
fn an_older_presentation_migrates_forward_and_is_saved_in_the_current_format() {
    let (harness, folder) = Harness::with_fixture("before-titles");

    let state = harness.open(&folder).state();

    assert_eq!(state.title, "Old talk");
    assert_eq!(word_starts(&state), [("w1", "Hi.", 100)]);
    let saved: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(folder.join("presentation.json")).unwrap())
            .unwrap();
    assert_eq!(saved["formatVersion"], 1);
    assert_eq!(saved["title"], "Old talk");
    assert!(saved.get("name").is_none());
}

#[test]
fn a_newer_presentation_is_refused_without_writing_anything() {
    let (harness, folder) = Harness::with_fixture("from-the-future");
    let before = fs::read_to_string(folder.join("presentation.json")).unwrap();

    let error = harness.open_error(&folder);

    assert!(matches!(
        error,
        StoreError::NewerFormat {
            found: 2,
            supported: 1
        }
    ));
    assert_eq!(
        fs::read_to_string(folder.join("presentation.json")).unwrap(),
        before
    );
    assert_eq!(fs::read_dir(&folder).unwrap().count(), 1);
}
