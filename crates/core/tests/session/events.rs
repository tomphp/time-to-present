use serde_json::json;
use ttp_core::script::{Anchor, Edit, EditError};
use ttp_core::session::{Session, SessionState};

use crate::support::Harness;

fn insert(anchor: Anchor, offset: i64, name: &str) -> Edit {
    Edit::InsertEvent {
        anchor,
        offset,
        name: name.into(),
        data: None,
    }
}

fn word(id: &str) -> Anchor {
    Anchor::Word(id.into())
}

/// Each Named Event as its name, anchor and offset, with the Script Time it fires at.
fn events(state: &SessionState) -> Vec<(&str, Anchor, i64, i64)> {
    state
        .named_events
        .iter()
        .map(|timed| {
            let event = &timed.event;
            (
                event.name.as_str(),
                event.anchor.clone(),
                event.offset,
                timed.time,
            )
        })
        .collect()
}

fn opened(fixture: &str) -> (Harness, Session) {
    let (harness, folder) = Harness::with_fixture(fixture);
    let session = harness.open(&folder);
    (harness, session)
}

#[test]
fn the_state_publishes_each_named_event_with_the_script_time_it_fires_at() {
    let (_harness, session) = opened("hello-world");

    assert_eq!(
        events(&session.state()),
        [
            ("slide", Anchor::ScriptStart, 0, 0),
            ("confetti", word("w3"), 800, 2200),
        ]
    );
}

#[test]
fn inserting_an_event_anchors_it_with_its_name_and_data_under_a_fresh_id() {
    let (_harness, mut session) = opened("hello-world");

    session
        .edit(Edit::InsertEvent {
            anchor: word("w2"),
            offset: 0,
            name: "slide".into(),
            data: Some(json!({"index": 2})),
        })
        .unwrap();

    let state = session.state();
    let inserted = state.named_events.last().unwrap();
    assert_eq!(
        events(&state).last().unwrap(),
        &("slide", word("w2"), 0, 850)
    );
    assert_eq!(inserted.event.data, Some(json!({"index": 2})));
    assert!(!["e1", "e2", "w1", "w2", "w3"].contains(&inserted.event.id.as_str()));
}

#[test]
fn inserting_an_event_at_the_script_start_anchors_it_there() {
    let (_harness, mut session) = opened("spoken-only");

    session
        .edit(insert(Anchor::ScriptStart, 0, "intro"))
        .unwrap();

    assert_eq!(
        events(&session.state()).last().unwrap(),
        &("intro", Anchor::ScriptStart, 0, 0)
    );
}

#[test]
fn an_event_is_named_without_surrounding_space_and_never_left_unnamed() {
    let (_harness, mut session) = opened("hello-world");

    session.edit(insert(word("w1"), 0, "  slide ")).unwrap();
    let error = session.edit(insert(word("w1"), 0, "  ")).unwrap_err();

    assert_eq!(events(&session.state())[2].0, "slide");
    assert_eq!(error, EditError::UnnamedEvent);
}

#[test]
fn an_event_cannot_be_anchored_to_a_word_that_is_not_there() {
    let (_harness, mut session) = opened("hello-world");

    let error = session.edit(insert(word("nope"), 0, "slide")).unwrap_err();

    assert_eq!(error, EditError::UnknownWord("nope".into()));
}

#[test]
fn renaming_an_event_and_changing_its_data_keeps_it_where_it_is() {
    let (_harness, mut session) = opened("hello-world");

    session
        .edit(Edit::SetEvent {
            event: "e2".into(),
            name: "balloons".into(),
            data: Some(json!([1, 2])),
        })
        .unwrap();

    let state = session.state();
    assert_eq!(events(&state)[1], ("balloons", word("w3"), 800, 2200));
    assert_eq!(state.named_events[1].event.data, Some(json!([1, 2])));
}

#[test]
fn an_event_that_is_not_there_cannot_be_changed() {
    let (_harness, mut session) = opened("hello-world");

    let error = session
        .edit(Edit::SetEvent {
            event: "e9".into(),
            name: "slide".into(),
            data: None,
        })
        .unwrap_err();

    assert_eq!(error, EditError::UnknownEvent("e9".into()));
}

fn move_event(event: &str, anchor: Anchor, offset: i64) -> Edit {
    Edit::MoveEvent {
        event: event.into(),
        anchor,
        offset,
    }
}

#[test]
fn moving_an_event_re_anchors_it_with_a_signed_offset_and_never_moves_words() {
    let (_harness, mut session) = opened("hello-world");
    let words = session.state().words;

    session.edit(move_event("e2", word("w2"), -120)).unwrap();

    let state = session.state();
    assert_eq!(events(&state)[1], ("confetti", word("w2"), -120, 730));
    assert_eq!(state.words, words);
}

#[test]
fn a_moved_event_keeps_its_name_and_data() {
    let (_harness, mut session) = opened("hello-world");
    session
        .edit(Edit::SetEvent {
            event: "e2".into(),
            name: "confetti".into(),
            data: Some(json!({"colour": "red"})),
        })
        .unwrap();

    session.edit(move_event("e2", word("w1"), 0)).unwrap();

    assert_eq!(
        session.state().named_events[1].event.data,
        Some(json!({"colour": "red"}))
    );
}

#[test]
fn an_event_cannot_be_moved_to_a_word_or_from_an_event_that_is_not_there() {
    let (_harness, mut session) = opened("hello-world");

    assert_eq!(
        session.edit(move_event("e2", word("nope"), 0)),
        Err(EditError::UnknownWord("nope".into()))
    );
    assert_eq!(
        session.edit(move_event("e9", word("w1"), 0)),
        Err(EditError::UnknownEvent("e9".into()))
    );
}

#[test]
fn a_dragged_event_is_one_undo_step() {
    let (_harness, mut session) = opened("hello-world");
    let original = session.state();

    for (anchor, offset) in [(word("w3"), 500), (word("w2"), 40), (word("w1"), -30)] {
        session
            .drag("d1", move_event("e2", anchor, offset))
            .unwrap();
    }

    assert_eq!(events(&session.state())[1].1, word("w1"));
    session.undo().unwrap();
    assert_eq!(session.state(), original);
}
