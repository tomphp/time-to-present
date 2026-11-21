use std::fs;

use ttp_core::store;

use crate::support::Harness;

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
