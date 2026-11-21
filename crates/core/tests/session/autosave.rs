use std::fs;
use std::path::Path;

use ttp_core::script::Edit;

use crate::support::Harness;

fn correct(text: &str) -> Edit {
    Edit::Correct {
        word: "w1".into(),
        text: text.into(),
    }
}

fn saved_first_word(folder: &Path) -> String {
    let json: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(folder.join("presentation.json")).unwrap())
            .unwrap();
    json["words"][0]["text"].as_str().unwrap().to_string()
}

fn leftovers(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .filter(|name| name != "presentation.json" && name != "recordings")
        .collect();
    names.sort();
    names
}

#[test]
fn an_edit_is_saved_500_ms_after_it_and_not_before() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(correct("Hullo,")).unwrap();

    harness.advance(499);
    session.tick().unwrap();
    assert_eq!(saved_first_word(&folder), "Hello,");

    harness.advance(1);
    session.tick().unwrap();
    assert_eq!(saved_first_word(&folder), "Hullo,");
    assert_eq!(leftovers(&folder), Vec::<String>::new());
}

#[test]
fn a_further_edit_restarts_the_wait() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(correct("One")).unwrap();
    harness.advance(300);
    session.edit(correct("Two")).unwrap();

    harness.advance(300);
    session.tick().unwrap();
    assert_eq!(saved_first_word(&folder), "Hello,");

    harness.advance(200);
    session.tick().unwrap();
    assert_eq!(saved_first_word(&folder), "Two");
}

#[test]
fn undo_and_redo_are_saved_like_any_edit() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(correct("Hullo,")).unwrap();
    harness.advance(500);
    session.tick().unwrap();

    session.undo();
    harness.advance(500);
    session.tick().unwrap();

    assert_eq!(saved_first_word(&folder), "Hello,");
}

#[test]
fn a_saved_presentation_opens_again_with_the_edit() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(correct("Hullo,")).unwrap();
    harness.advance(500);
    session.tick().unwrap();
    let edited = session.state();

    assert_eq!(harness.open(&folder).state(), edited);
}
