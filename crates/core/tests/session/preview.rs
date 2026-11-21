use std::sync::{Arc, Mutex};

use ttp_core::clock::{ClockState, StreamEvent};
use ttp_core::script::EditError;
use ttp_core::session::Session;

use crate::support::{Harness, Stream, correct};

fn previewing_published(session: &mut Session) -> Arc<Mutex<Vec<bool>>> {
    let published = Arc::new(Mutex::new(Vec::new()));
    let sink = published.clone();
    session.subscribe(move |state| sink.lock().unwrap().push(state.previewing));
    published.lock().unwrap().clear();
    published
}

#[test]
fn a_preview_seeks_to_the_cursor_and_plays_from_there() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.preview(Some(850));
    harness.advance(100);

    let snapshot = session.snapshot();
    assert_eq!(snapshot.clock.state, ClockState::Playing);
    assert_eq!(snapshot.clock.script_time, 950);
    assert_eq!(snapshot.current_word.unwrap().id, "w2");
    assert!(session.state().previewing);
}

#[test]
fn a_preview_from_the_start_of_a_ready_clock_fires_the_start_as_play_does() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let stream = Stream::of(&mut session);

    session.preview(Some(0));

    let fired = stream.take();
    assert!(matches!(fired[0], StreamEvent::Clock { .. }));
    assert!(matches!(&fired[1], StreamEvent::NamedEvent(event) if event.id == "e1"));
}

#[test]
fn a_preview_with_no_cursor_plays_on_from_where_the_clock_stands() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.seek(500);

    session.preview(None);

    assert_eq!(session.snapshot().clock.script_time, 500);
    assert!(session.state().previewing);
}

#[test]
fn a_clock_played_from_anywhere_else_is_not_a_preview() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.play();

    assert!(session.state().locked);
    assert!(!session.state().previewing);
}

#[test]
fn a_preview_never_takes_over_a_clock_already_playing() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.play();
    harness.advance(200);

    session.preview(Some(1_400));

    assert_eq!(session.snapshot().clock.script_time, 200);
    assert!(!session.state().previewing);
}

#[test]
fn the_preview_is_over_once_the_clock_stops_and_a_later_play_is_not_one() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let published = previewing_published(&mut session);

    session.preview(Some(0));
    session.pause();
    session.play();

    assert_eq!(*published.lock().unwrap(), [true, false, false]);
}

#[test]
fn the_preview_is_over_when_the_clock_reaches_script_end() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.preview(Some(2_000));

    harness.advance(500);
    session.poll().unwrap();

    assert_eq!(session.snapshot().clock.state, ClockState::Ended);
    assert!(!session.state().previewing);
}

#[test]
fn a_preview_from_ended_plays_again_from_the_cursor() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.preview(Some(2_000));
    harness.advance(500);
    session.poll().unwrap();

    session.preview(Some(400));

    assert_eq!(session.snapshot().clock.state, ClockState::Playing);
    assert!(session.state().previewing);
}

#[test]
fn the_script_is_locked_while_a_preview_plays() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.preview(Some(0));

    assert!(session.state().locked);
    assert_eq!(
        session.edit(correct("w1", "Hullo,")),
        Err(EditError::ClockPlaying)
    );
}
