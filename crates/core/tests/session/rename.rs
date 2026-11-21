use std::fs;

use crate::support::Harness;

#[test]
fn renaming_changes_the_title_and_nothing_else() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let words = session.state().words;

    session.rename("  A better title ").unwrap();

    let state = session.state();
    assert_eq!(state.title, "A better title");
    assert_eq!(state.words, words);
    assert_eq!(state.folder, folder);
    assert_eq!(harness.open(&folder).state(), state);
}

#[test]
fn renaming_leaves_the_folder_where_it_is() {
    let (harness, folder) = Harness::with_fixture("hello-world");

    harness.open(&folder).rename("Other").unwrap();

    assert!(folder.join("presentation.json").is_file());
    assert_eq!(fs::read_dir(harness.parent()).unwrap().count(), 1);
}

#[test]
fn renaming_publishes_the_new_state_to_subscribers() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let titles = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let sink = titles.clone();
    session.subscribe(move |state| sink.lock().unwrap().push(state.title.clone()));

    session.rename("Other").unwrap();

    assert_eq!(*titles.lock().unwrap(), ["Hello world", "Other"]);
}

#[test]
fn a_title_cannot_be_blank_and_a_failed_rename_changes_nothing() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    assert!(session.rename("  ").is_err());

    assert_eq!(session.state().title, "Hello world");
    assert_eq!(harness.open(&folder).state().title, "Hello world");
}
