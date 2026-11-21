use ttp_core::script::Edit;

use crate::support::{Harness, word_starts};

fn correct(word: &str, text: &str) -> Edit {
    Edit::Correct {
        word: word.into(),
        text: text.into(),
    }
}

#[test]
fn undo_reverts_the_last_edit_and_redo_reapplies_it() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();
    session.edit(correct("w1", "Hullo,")).unwrap();
    let edited = session.state();

    session.undo();
    assert_eq!(session.state(), original);
    session.redo();
    assert_eq!(session.state(), edited);
}

#[test]
fn undo_is_unlimited_and_linear() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();
    for n in 0..200 {
        session.edit(correct("w1", &format!("v{n}"))).unwrap();
    }

    for _ in 0..200 {
        session.undo();
    }

    assert_eq!(session.state(), original);
}

#[test]
fn a_new_edit_after_undo_discards_the_redo_history() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(correct("w1", "One")).unwrap();
    session.undo();
    session.edit(correct("w1", "Two")).unwrap();

    session.redo();

    assert_eq!(session.state().words[0].word.text, "Two");
}

#[test]
fn undo_and_redo_with_nothing_to_do_change_nothing() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();

    session.undo();
    session.redo();

    assert_eq!(session.state(), original);
}

#[test]
fn undo_and_redo_are_published_to_subscribers() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let published = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let sink = published.clone();
    session.subscribe(move |state| {
        sink.lock()
            .unwrap()
            .push(word_starts(state)[0].1.to_string())
    });

    session.edit(correct("w1", "Hullo,")).unwrap();
    session.undo();
    session.redo();

    assert_eq!(
        *published.lock().unwrap(),
        ["Hello,", "Hullo,", "Hello,", "Hullo,"]
    );
}

#[test]
fn a_word_split_off_then_undone_never_gets_its_id_reused() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session
        .edit(Edit::Split {
            word: "w1".into(),
            at: 2,
        })
        .unwrap();
    let split_off = session.state().words[1].word.id.clone();
    session.undo();

    session
        .edit(Edit::InsertWord {
            after: Some("w3".into()),
            text: "new".into(),
        })
        .unwrap();

    assert_ne!(session.state().words[3].word.id, split_off);
}

#[test]
fn an_edit_that_changes_nothing_is_not_an_undo_step() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(correct("w1", "Hullo,")).unwrap();
    session
        .edit(Edit::SetBreak {
            word: "w2".into(),
            break_after: Some(ttp_core::script::BreakAfter::Paragraph),
        })
        .unwrap();

    session.undo();

    assert_eq!(session.state().words[0].word.text, "Hello,");
}

#[test]
fn a_batch_of_edits_is_one_undo_step() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();

    session
        .edit(Edit::Batch {
            edits: vec![correct("w1", "One"), correct("w2", "two")],
        })
        .unwrap();
    assert_eq!(
        word_starts(&session.state())[..2],
        [("w1", "One", 400), ("w2", "two", 850)]
    );

    session.undo();
    assert_eq!(session.state(), original);
}

#[test]
fn a_batch_that_fails_part_way_leaves_the_script_as_it_was() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();

    let error = session
        .edit(Edit::Batch {
            edits: vec![correct("w1", "One"), correct("nope", "x")],
        })
        .unwrap_err();

    assert!(matches!(error, ttp_core::script::EditError::UnknownWord(_)));
    assert_eq!(session.state(), original);
    session.undo();
    assert_eq!(session.state(), original);
}
