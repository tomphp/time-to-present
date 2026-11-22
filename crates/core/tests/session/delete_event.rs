use serde_json::json;
use ttp_core::clock::StreamEvent;
use ttp_core::script::{Edit, EditError};
use ttp_core::session::Session;

use crate::support::{Harness, Stream};

fn delete_event(event: &str) -> Edit {
    Edit::DeleteEvent {
        event: event.into(),
    }
}

fn opened() -> (Harness, Session) {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let session = harness.open(&folder);
    (harness, session)
}

fn event_ids(session: &Session) -> Vec<String> {
    let state = session.state();
    state.named_events.into_iter().map(|e| e.event.id).collect()
}

#[test]
fn deleting_an_event_removes_only_that_event() {
    let (_harness, mut session) = opened();
    let before = session.state();

    session.edit(delete_event("e1")).unwrap();

    let state = session.state();
    assert_eq!(event_ids(&session), ["e2"]);
    assert_eq!(state.named_events[0], before.named_events[1]);
    assert_eq!(state.words, before.words);
}

#[test]
fn an_event_that_is_not_there_cannot_be_deleted() {
    let (_harness, mut session) = opened();
    let before = session.state();

    assert_eq!(
        session.edit(delete_event("e9")),
        Err(EditError::UnknownEvent("e9".into()))
    );
    assert_eq!(session.state(), before);
}

#[test]
fn undo_restores_the_deleted_event_in_its_place_and_redo_deletes_it_again() {
    let (_harness, mut session) = opened();
    session
        .edit(Edit::SetEvent {
            event: "e1".into(),
            name: "slide".into(),
            data: Some(json!({"index": 7})),
        })
        .unwrap();
    let before = session.state();

    session.edit(delete_event("e1")).unwrap();
    session.undo().unwrap();
    assert_eq!(session.state(), before);

    session.redo().unwrap();
    assert_eq!(event_ids(&session), ["e2"]);
}

#[test]
fn deleting_an_event_is_refused_while_the_clock_is_playing() {
    let (_harness, mut session) = opened();
    session.play();

    assert_eq!(
        session.edit(delete_event("e2")),
        Err(EditError::ClockPlaying)
    );
    assert_eq!(event_ids(&session), ["e1", "e2"]);
}

#[test]
fn deleting_the_last_event_after_the_last_word_moves_script_end_earlier() {
    let (_harness, mut session) = opened();
    assert_eq!(session.state().script_end, 2_200);

    session.edit(delete_event("e2")).unwrap();

    assert_eq!(session.state().script_end, 1_700);
}

#[test]
fn a_deleted_event_takes_its_moved_badge_with_it() {
    let (_harness, mut session) = opened();
    session.edit(Edit::Merge { word: "w2".into() }).unwrap();
    assert_eq!(session.state().moved_events, ["e2"]);

    session.edit(delete_event("e2")).unwrap();

    assert!(session.state().moved_events.is_empty());
}

#[test]
fn clients_see_a_deleted_event_gone_from_the_next_snapshot() {
    let (_harness, mut session) = opened();
    session.seek(99_999);
    assert_eq!(session.snapshot().passed_events.len(), 2);
    let stream = Stream::of(&mut session);

    session.edit(delete_event("e2")).unwrap();

    let published = stream.take();
    let [StreamEvent::Snapshot(snapshot)] = published.as_slice() else {
        panic!("expected one Snapshot");
    };
    let passed: Vec<&str> = snapshot
        .passed_events
        .iter()
        .map(|e| e.id.as_str())
        .collect();
    assert_eq!(passed, ["e1"]);
}
