use ttp_core::script::{Edit, EditError};

use crate::support::{Harness, starts};

fn move_w2_by(by: i64) -> Edit {
    Edit::Move {
        word: "w2".into(),
        by,
    }
}

fn gap_of_w2(session: &ttp_core::session::Session) -> i64 {
    session.state().words[1].word.gap
}

#[test]
fn each_step_of_a_drag_replaces_the_one_before() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.drag("d1", move_w2_by(100)).unwrap();
    session.drag("d1", move_w2_by(250)).unwrap();

    assert_eq!(gap_of_w2(&session), 400);
    assert_eq!(starts(&session.state())[2], ("Typed", 1650));
}

#[test]
fn a_whole_drag_is_one_undo_step() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();
    for by in [20, 60, -30, 120] {
        session.drag("d1", move_w2_by(by)).unwrap();
    }
    let dragged = session.state();

    session.undo().unwrap();
    assert_eq!(session.state(), original);
    session.redo().unwrap();
    assert_eq!(session.state(), dragged);
}

#[test]
fn a_new_drag_is_a_new_undo_step() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.drag("d1", move_w2_by(100)).unwrap();
    session.drag("d2", move_w2_by(100)).unwrap();

    assert_eq!(gap_of_w2(&session), 350);
    session.undo().unwrap();
    assert_eq!(gap_of_w2(&session), 250);
}

#[test]
fn a_step_of_a_drag_that_lands_after_undo_is_ignored() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.drag("d1", move_w2_by(100)).unwrap();
    session.undo().unwrap();

    session.drag("d1", move_w2_by(150)).unwrap();

    assert_eq!(gap_of_w2(&session), 150);
    session.redo().unwrap();
    assert_eq!(gap_of_w2(&session), 250);
}

#[test]
fn a_step_of_a_drag_that_lands_after_an_edit_is_ignored() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.drag("d1", move_w2_by(50)).unwrap();
    session.edit(move_w2_by(10)).unwrap();

    session.drag("d1", move_w2_by(80)).unwrap();

    assert_eq!(gap_of_w2(&session), 210);
}

#[test]
fn a_step_of_a_drag_that_lands_after_a_cut_is_ignored() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.drag("d1", move_w2_by(50)).unwrap();
    session.cut(&["w3".into()]).unwrap();
    let cut = session.state();

    session.drag("d1", move_w2_by(80)).unwrap();

    assert_eq!(session.state(), cut);
    session.undo().unwrap();
    assert_eq!(gap_of_w2(&session), 200);
}

#[test]
fn a_step_of_a_drag_that_lands_after_a_paste_is_ignored() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.drag("d1", move_w2_by(50)).unwrap();
    session.paste(Some("w3".into()), &[], "pasted").unwrap();
    let pasted = session.state();

    session.drag("d1", move_w2_by(80)).unwrap();

    assert_eq!(session.state(), pasted);
    session.undo().unwrap();
    assert_eq!(gap_of_w2(&session), 200);
}

#[test]
fn a_drag_back_to_where_it_started_leaves_no_undo_step() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session
        .edit(Edit::Correct {
            word: "w1".into(),
            text: "Hullo,".into(),
        })
        .unwrap();
    session.drag("d1", move_w2_by(100)).unwrap();

    session.drag("d1", move_w2_by(0)).unwrap();
    session.undo().unwrap();

    assert_eq!(session.state().words[0].word.text, "Hello,");
    assert_eq!(gap_of_w2(&session), 150);
}

#[test]
fn a_trim_dragged_past_its_limit_and_back_to_its_start_leaves_no_undo_step() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();
    let trimmed = |by| Edit::TrimStart {
        word: "w2".into(),
        by,
    };
    session.drag("d1", trimmed(-400)).unwrap();
    assert_eq!(gap_of_w2(&session), 0);

    session.drag("d1", trimmed(0)).unwrap();
    assert_eq!(session.state(), original);
    session.drag("d1", trimmed(50)).unwrap();
    session.undo().unwrap();

    assert_eq!(session.state(), original);
    session.undo().unwrap();
    assert_eq!(session.state(), original);
}

#[test]
fn a_failed_drag_step_changes_nothing() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.drag("d1", move_w2_by(100)).unwrap();
    let before = session.state();

    let failed = Edit::Move {
        word: "w9".into(),
        by: 10,
    };
    assert!(session.drag("d1", failed).is_err());

    assert_eq!(session.state(), before);
}

#[test]
fn undoing_a_drag_keeps_the_moved_badges_of_the_edit_before_it() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(Edit::Merge { word: "w2".into() }).unwrap();
    session.drag("d1", move_w2_by(100)).unwrap();

    session.undo().unwrap();
    assert_eq!(session.state().moved_events, ["e2"]);
    session.undo().unwrap();
    assert!(session.state().moved_events.is_empty());
}

#[test]
fn only_a_timing_edit_or_an_event_move_can_be_dragged() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let before = session.state();

    let merge = Edit::Merge { word: "w2".into() };
    assert_eq!(session.drag("d1", merge), Err(EditError::NotDraggable));

    assert_eq!(session.state(), before);
}
