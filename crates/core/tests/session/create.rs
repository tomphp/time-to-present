use std::fs;

use serde_json::{Value, json};
use ttp_core::store::StoreError;

use crate::support::Harness;

#[test]
fn a_new_presentation_is_a_folder_named_after_its_title_with_an_empty_script() {
    let harness = Harness::new();

    let state = harness.create("My Talk").state();

    assert_eq!(state.title, "My Talk");
    assert_eq!(state.folder, harness.parent().join("My Talk"));
    assert!(state.words.is_empty());
    assert_eq!(state.script_end, 0);
}

#[test]
fn a_new_presentation_folder_holds_presentation_json_empty_recordings_and_the_template_source() {
    let harness = Harness::new();
    let folder = harness.create("My Talk").state().folder;

    let json: Value =
        serde_json::from_str(&fs::read_to_string(folder.join("presentation.json")).unwrap())
            .unwrap();
    assert_eq!(
        json,
        json!({"formatVersion": 1, "title": "My Talk", "recordings": [], "words": [], "namedEvents": []})
    );
    assert_eq!(fs::read_dir(folder.join("recordings")).unwrap().count(), 0);
    assert!(folder.join("app-src/README.md").is_file());
    assert!(folder.join("app-src/src/main.ts").is_file());
}

#[test]
fn a_new_presentation_reads_back_the_same_when_opened_again() {
    let harness = Harness::new();
    let created = harness.create("My Talk").state();

    assert_eq!(harness.open(&created.folder).state(), created);
}

#[test]
fn a_new_presentation_never_overwrites_an_existing_folder() {
    let harness = Harness::new();
    let existing = harness.parent().join("My Talk");
    fs::create_dir(&existing).unwrap();
    fs::write(existing.join("notes.txt"), "keep me").unwrap();

    let error = harness.create_error("My Talk");

    assert!(matches!(error, StoreError::AlreadyExists(ref folder) if *folder == existing));
    assert_eq!(fs::read_dir(&existing).unwrap().count(), 1);
}

#[test]
fn a_new_presentation_needs_a_title() {
    let harness = Harness::new();

    assert!(matches!(
        harness.create_error("   "),
        StoreError::EmptyTitle
    ));
}

#[test]
fn a_title_with_path_separators_still_makes_one_folder_in_the_parent() {
    let harness = Harness::new();

    let state = harness.create("Q3 / Q4: review").state();

    assert_eq!(state.title, "Q3 / Q4: review");
    assert_eq!(state.folder, harness.parent().join("Q3 - Q4- review"));
}
