use ttp_core::script::{Anchor, BreakAfter, Edit};
use ttp_core::session::Session;

use crate::support::Harness;

fn hello_world() -> (Harness, Session) {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let session = harness.open(&folder);
    (harness, session)
}

fn gap_nudge(by: i64) -> Edit {
    Edit::Move {
        word: "w2".into(),
        by,
    }
}

fn gap_of_w2(session: &Session) -> i64 {
    session.state().words[1].word.gap
}

#[test]
fn a_run_of_nudges_is_one_undo_step() {
    let (_harness, mut session) = hello_world();
    let original = session.state();

    for _ in 0..3 {
        session.nudge("gap:w2", gap_nudge(10)).unwrap();
    }

    assert_eq!(gap_of_w2(&session), 180);
    session.undo();
    assert_eq!(session.state(), original);
    session.redo();
    assert_eq!(gap_of_w2(&session), 180);
}

#[test]
fn nudges_after_another_change_start_a_new_step() {
    let (_harness, mut session) = hello_world();
    session.nudge("gap:w2", gap_nudge(10)).unwrap();
    session
        .edit(Edit::SetBreak {
            word: "w1".into(),
            break_after: Some(BreakAfter::Line),
        })
        .unwrap();
    session.nudge("gap:w2", gap_nudge(10)).unwrap();

    session.undo();

    assert_eq!(gap_of_w2(&session), 160);
}

#[test]
fn nudging_something_else_starts_a_new_step() {
    let (_harness, mut session) = hello_world();
    session.nudge("gap:w2", gap_nudge(10)).unwrap();
    session
        .nudge(
            "duration:w2",
            Edit::TrimEnd {
                word: "w2".into(),
                by: 10,
            },
        )
        .unwrap();

    session.undo();

    assert_eq!(session.state().words[1].word.duration, 450);
    assert_eq!(gap_of_w2(&session), 160);
}

#[test]
fn a_run_of_nudges_after_undo_starts_a_new_step() {
    let (_harness, mut session) = hello_world();
    session.nudge("gap:w2", gap_nudge(10)).unwrap();
    session.undo();
    session.nudge("gap:w2", gap_nudge(10)).unwrap();

    session.undo();

    assert_eq!(gap_of_w2(&session), 150);
}

#[test]
fn only_timing_edits_can_be_nudged() {
    let (_harness, mut session) = hello_world();

    let result = session.nudge(
        "x",
        Edit::SetEvent {
            event: "e1".into(),
            name: "n".into(),
            data: None,
        },
    );

    assert!(result.is_err());
}

#[test]
fn an_event_offset_is_set_in_signed_milliseconds() {
    let (_harness, mut session) = hello_world();

    session
        .edit(Edit::SetOffset {
            event: "e2".into(),
            offset: -120,
        })
        .unwrap();

    let event = &session.state().named_events[1];
    assert_eq!(event.event.anchor, Anchor::Word("w3".into()));
    assert_eq!(event.event.offset, -120);
}
