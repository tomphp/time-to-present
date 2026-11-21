use ttp_core::script::{Anchor, Edit};

use crate::support::Harness;

fn merge(word: &str) -> Edit {
    Edit::Merge { word: word.into() }
}

fn delete(word: &str) -> Edit {
    Edit::Delete {
        words: vec![word.into()],
    }
}

#[test]
fn an_event_reanchored_by_a_merge_or_delete_gets_a_moved_badge() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    assert!(session.state().moved_events.is_empty());

    session.edit(merge("w2")).unwrap();
    assert_eq!(session.state().moved_events, ["e2"]);

    session.undo();
    session.edit(delete("w3")).unwrap();
    assert_eq!(session.state().moved_events, ["e2"]);
}

#[test]
fn events_an_edit_leaves_on_their_words_get_no_badge() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.edit(merge("w1")).unwrap();
    session
        .edit(Edit::InsertEvent {
            anchor: Anchor::Word("w3".into()),
            offset: 0,
            name: "slide".into(),
            data: None,
        })
        .unwrap();
    session
        .edit(Edit::SetEvent {
            event: "e2".into(),
            name: "balloons".into(),
            data: None,
        })
        .unwrap();

    assert!(session.state().moved_events.is_empty());
}

#[test]
fn selecting_an_event_clears_its_badge_without_an_undo_step() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(merge("w2")).unwrap();
    let merged = session.state().words.clone();

    session.select_event("e2");
    assert!(session.state().moved_events.is_empty());

    session.undo();
    assert_ne!(session.state().words, merged);
}

#[test]
fn selecting_publishes_the_cleared_badge() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(merge("w2")).unwrap();
    let published = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let sink = published.clone();
    session.subscribe(move |state| sink.lock().unwrap().push(state.moved_events.len()));

    session.select_event("e2");
    session.select_event("e2");

    assert_eq!(*published.lock().unwrap(), [1, 0]);
}

#[test]
fn undo_removes_the_badges_its_step_set_and_redo_brings_them_back() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(merge("w2")).unwrap();

    session.undo();
    assert!(session.state().moved_events.is_empty());

    session.redo();
    assert_eq!(session.state().moved_events, ["e2"]);
}

#[test]
fn undoing_a_later_edit_keeps_the_badges_an_earlier_one_set() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(merge("w2")).unwrap();
    session
        .edit(Edit::Correct {
            word: "w1".into(),
            text: "Hullo,".into(),
        })
        .unwrap();

    session.undo();

    assert_eq!(session.state().moved_events, ["e2"]);
}

#[test]
fn badges_are_never_saved() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(merge("w2")).unwrap();
    session.flush().unwrap();

    let saved = std::fs::read_to_string(folder.join("presentation.json")).unwrap();
    let reopened = harness.open(&folder);

    assert!(!saved.contains("moved"), "{saved}");
    assert!(reopened.state().moved_events.is_empty());
    assert_eq!(
        reopened.state().named_events[1].event.anchor,
        Anchor::Word("w2".into())
    );
}

#[test]
fn undoing_a_step_keeps_a_badge_an_earlier_step_set_on_the_same_event() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(delete("w3")).unwrap();
    session.edit(delete("w2")).unwrap();

    session.undo();

    assert_eq!(session.state().moved_events, ["e2"]);
}
