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
