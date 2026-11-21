use ttp_core::capture::InputChoice;
use ttp_core::clock::{ClockState, StreamEvent};
use ttp_core::script::{Edit, EditError};
use ttp_core::session::{InsertionPoint, Session};

use crate::support::{Harness, Stream, correct};

fn delete_last_two() -> Edit {
    Edit::Delete {
        words: vec!["w2".into(), "w3".into()],
    }
}

fn move_w2_by(by: i64) -> Edit {
    Edit::Move {
        word: "w2".into(),
        by,
    }
}

#[test]
fn script_commands_are_refused_while_the_clock_is_playing() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(correct("w1", "Hullo,")).unwrap();
    session.play();
    let before = session.state();

    assert_eq!(
        session.edit(correct("w1", "Hi,")),
        Err(EditError::ClockPlaying)
    );
    assert_eq!(session.undo(), Err(EditError::ClockPlaying));
    assert_eq!(session.redo(), Err(EditError::ClockPlaying));
    assert_eq!(session.state(), before);
    assert!(session.state().locked);
}

#[test]
fn cut_and_paste_are_refused_while_the_clock_is_playing_but_copy_is_not() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.play();
    let before = session.state();

    assert_eq!(session.cut(&["w1".into()]), Err(EditError::ClockPlaying));
    assert_eq!(
        session.paste(Some("w1".into()), &[], "Typed"),
        Err(EditError::ClockPlaying)
    );
    session.copy(&["w1".into()]).unwrap();
    assert_eq!(session.state(), before);
}

#[test]
fn drags_and_nudges_are_refused_while_the_clock_is_playing() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.play();
    let before = session.state();

    assert_eq!(
        session.drag("d1", move_w2_by(100)),
        Err(EditError::ClockPlaying)
    );
    assert_eq!(
        session.nudge("gap:w2", move_w2_by(10)),
        Err(EditError::ClockPlaying)
    );
    assert_eq!(session.state(), before);
}

#[test]
fn script_commands_work_again_once_the_clock_pauses() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.play();
    session.pause();

    session.edit(correct("w1", "Hullo,")).unwrap();
    session.undo().unwrap();
    session.redo().unwrap();

    assert_eq!(session.state().words[0].word.text, "Hullo,");
    assert!(!session.state().locked);
}

#[test]
fn each_edit_bumps_the_script_version_and_broadcasts_a_snapshot() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let stream = Stream::of(&mut session);

    session.edit(correct("w1", "Hullo,")).unwrap();
    session.undo().unwrap();
    session.redo().unwrap();
    session.cut(&["w3".into()]).unwrap();
    session.paste(Some("w1".into()), &[], "Typed").unwrap();
    session.drag("d1", move_w2_by(100)).unwrap();
    session.nudge("gap:w2", move_w2_by(10)).unwrap();
    session.rename("Other").unwrap();

    let versions: Vec<u64> = stream
        .take()
        .into_iter()
        .map(|event| match event {
            StreamEvent::Snapshot(snapshot) => snapshot.script_version,
            other => panic!("unexpected {other:?}"),
        })
        .collect();
    assert_eq!(versions, [2, 3, 4, 5, 6, 7, 8]);
    assert_eq!(session.snapshot().script_version, 8);
}

#[test]
fn the_lock_lifts_at_script_end_before_the_next_poll() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.play();
    harness.advance(3_000);

    session.edit(correct("w1", "Hullo,")).unwrap();

    assert_eq!(session.snapshot().clock.state, ClockState::Ended);
    assert!(!session.state().locked);
}

#[test]
fn an_edit_keeps_script_time_clamped_to_the_new_script_end() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.seek(2_000);

    session.edit(delete_last_two()).unwrap();

    let snapshot = session.snapshot();
    assert_eq!(snapshot.clock.state, ClockState::Paused);
    assert_eq!(snapshot.clock.script_time, 700);
    assert_eq!(snapshot.current_word.unwrap().id, "w1");
}

#[test]
fn an_edit_that_lengthens_the_script_takes_an_ended_clock_back_to_paused() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.play();
    harness.advance(3_000);
    session.poll().unwrap();

    session
        .edit(Edit::InsertWord {
            after: Some("w3".into()),
            text: "Supercalifragilistic".into(),
        })
        .unwrap();

    assert_eq!(session.snapshot().clock.state, ClockState::Paused);
    assert_eq!(session.snapshot().clock.script_time, 2_200);
}

#[test]
fn closing_the_session_broadcasts_closed_last() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(correct("w1", "Hullo,")).unwrap();
    let stream = Stream::of(&mut session);

    session.close().unwrap();

    assert_eq!(
        stream.take(),
        [StreamEvent::Closed {
            reason: "closed".into()
        }]
    );
    assert_eq!(harness.open(&folder).state().words[0].word.text, "Hullo,");
}

fn record_at_end(harness: &Harness, session: &mut Session) {
    session.open_recording_bar(InputChoice::default());
    session.start_recording(InsertionPoint::default()).unwrap();
    harness.audio.play(&[0.1; 480]);
    session.stop_recording().unwrap();
}

#[test]
fn a_transcription_heard_while_the_clock_is_playing_lands_once_it_stops() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record_at_end(&harness, &mut session);
    session.play();
    let stream = Stream::of(&mut session);

    harness.transcriber.hear(&[("Thanks", 100, 400)]);
    session.poll().unwrap();

    assert_eq!(session.state().pending_passages.len(), 1);
    assert_eq!(session.state().words.len(), 3);
    assert!(
        stream
            .take()
            .iter()
            .all(|event| !matches!(event, StreamEvent::Snapshot(_)))
    );

    session.pause();
    session.poll().unwrap();

    assert!(session.state().pending_passages.is_empty());
    assert_eq!(session.state().words[3].word.text, "Thanks");
    assert!(
        stream
            .take()
            .iter()
            .any(|event| matches!(event, StreamEvent::Snapshot(_)))
    );
}

#[test]
fn held_transcriptions_land_in_the_order_their_recordings_were_made() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record_at_end(&harness, &mut session);
    record_at_end(&harness, &mut session);
    session.play();
    harness.transcriber.hear(&[("one", 100, 400)]);
    session.poll().unwrap();
    harness.transcriber.hear(&[("two", 100, 400)]);
    session.poll().unwrap();
    assert_eq!(session.state().pending_passages.len(), 2);

    session.pause();
    session.poll().unwrap();

    let state = session.state();
    let texts: Vec<&str> = state.words[3..]
        .iter()
        .map(|word| word.word.text.as_str())
        .collect();
    assert_eq!(texts, ["one", "two"]);
}

#[test]
fn a_held_transcription_can_be_discarded_and_never_lands() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record_at_end(&harness, &mut session);
    session.play();
    harness.transcriber.hear(&[("Thanks", 100, 400)]);
    session.poll().unwrap();

    session.discard_transcription("r2").unwrap();
    session.pause();
    session.poll().unwrap();

    assert!(session.state().pending_passages.is_empty());
    assert_eq!(session.state().words.len(), 3);
}
