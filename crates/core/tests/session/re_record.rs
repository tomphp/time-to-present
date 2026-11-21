use ttp_core::capture::{CaptureError, InputChoice};
use ttp_core::script::{Anchor, BreakAfter, Edit, EditError};
use ttp_core::session::{InsertionPoint, PendingPassage, PendingStatus, Session, SessionState};

use crate::support::{Harness, starts};

fn ids(words: &[&str]) -> Vec<String> {
    words.iter().map(|&id| id.into()).collect()
}

fn re_record(harness: &Harness, session: &mut Session, words: &[&str]) {
    session.open_recording_bar(InputChoice::default());
    session.start_re_recording(&ids(words)).unwrap();
    harness.audio.play(&[0.1; 480]);
    session.stop_recording().unwrap();
}

#[test]
fn recording_over_a_selection_shows_the_range_while_capturing_and_pending_and_keeps_its_words() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state().words;
    session.open_recording_bar(InputChoice::default());

    session.start_re_recording(&ids(&["w2", "w1"])).unwrap();
    assert_eq!(session.state().re_recording, ids(&["w1", "w2"]));

    harness.audio.play(&[0.1; 480]);
    session.stop_recording().unwrap();
    let state = session.state();
    assert!(state.re_recording.is_empty());
    assert_eq!(state.words, original);
    assert_eq!(
        state.pending_passages,
        [PendingPassage {
            recording_id: "r2".into(),
            after: None,
            before: Some("w3".into()),
            replacing: ids(&["w1", "w2"]),
            status: PendingStatus::Queued,
        }]
    );
}

#[test]
fn the_live_transcript_of_a_re_record_sits_between_the_words_either_side_of_the_range() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.open_recording_bar(InputChoice::default());

    session.start_re_recording(&ids(&["w2"])).unwrap();

    let live = session.state().live_transcript.expect("a Live Transcript");
    assert_eq!(
        (live.after, live.before),
        (Some("w1".into()), Some("w3".into()))
    );
}

#[test]
fn on_landing_the_range_is_replaced_by_the_new_words_in_one_edit_that_undo_restores_exactly() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();
    re_record(&harness, &mut session, &["w2"]);

    harness.transcriber.hear(&[("planet.", 1_000, 1_400)]);
    session.poll().unwrap();

    let state = session.state();
    assert!(state.pending_passages.is_empty());
    assert_eq!(
        starts(&state),
        [("Hello,", 400), ("planet.", 850), ("Typed", 1_350)]
    );
    session.undo().unwrap();
    let undone = session.state();
    assert_eq!(
        (undone.words, undone.named_events, undone.moved_events),
        (original.words, original.named_events, original.moved_events)
    );
}

#[test]
fn the_first_new_word_takes_the_first_replaced_words_gap_and_the_word_after_keeps_its_own() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    re_record(&harness, &mut session, &["w1", "w2"]);

    harness
        .transcriber
        .hear(&[("Hi", 2_000, 2_200), ("there.", 2_300, 2_600)]);
    session.poll().unwrap();

    let state = session.state();
    assert_eq!(
        starts(&state),
        [("Hi", 400), ("there.", 700), ("Typed", 1_100)]
    );
    let gaps: Vec<_> = state.words.iter().map(|word| word.word.gap).collect();
    assert_eq!(gaps, [400, 100, 100]);
}

fn insert_event(session: &mut Session, name: &str, word: &str, offset: i64) {
    let edit = Edit::InsertEvent {
        anchor: Anchor::Word(word.into()),
        offset,
        name: name.into(),
        data: None,
    };
    session.edit(edit).unwrap();
}

/// Each Named Event's name with the text of the Word it is anchored to, and its offset.
fn anchored(state: &SessionState) -> Vec<(&str, &str, i64)> {
    let text = |id: &str| {
        let word = state.words.iter().find(|word| word.word.id == id);
        word.map_or("", |word| word.word.text.as_str())
    };
    let events = state.named_events.iter().map(|timed| &timed.event);
    events
        .map(|event| match &event.anchor {
            Anchor::Word(id) => (event.name.as_str(), text(id), event.offset),
            Anchor::ScriptStart => (event.name.as_str(), "", event.offset),
        })
        .collect()
}

#[test]
fn events_in_the_range_move_to_the_new_word_nearest_the_same_fraction_keeping_offset_and_marked_moved()
 {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    insert_event(&mut session, "intro", "w1", 0);
    insert_event(&mut session, "chart", "w2", 50);
    re_record(&harness, &mut session, &["w1", "w2", "w3"]);

    harness.transcriber.hear(&[
        ("one", 0, 100),
        ("two", 200, 300),
        ("three", 400, 500),
        ("four", 600, 700),
        ("five", 800, 1_000),
    ]);
    session.poll().unwrap();

    let state = session.state();
    assert_eq!(
        anchored(&state),
        [
            ("slide", "", 0),
            ("confetti", "five", 800),
            ("intro", "one", 0),
            ("chart", "three", 50)
        ]
    );
    let moved: Vec<_> = (state.named_events.iter())
        .filter(|timed| state.moved_events.contains(&timed.event.id))
        .map(|timed| timed.event.name.as_str())
        .collect();
    assert_eq!(moved, ["confetti", "intro", "chart"]);
}

#[test]
fn a_re_anchored_event_never_sits_before_its_new_words_gap() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    insert_event(&mut session, "chart", "w2", -150);
    re_record(&harness, &mut session, &["w1", "w2"]);

    harness
        .transcriber
        .hear(&[("Hi", 0, 300), ("there.", 340, 800)]);
    session.poll().unwrap();

    assert_eq!(anchored(&session.state())[2], ("chart", "there.", -40));
}

fn texts(state: &SessionState) -> Vec<&str> {
    starts(state).into_iter().map(|(text, _)| text).collect()
}

#[test]
fn a_passage_pending_against_the_range_lands_beside_the_new_words() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    re_record(&harness, &mut session, &["w1", "w2"]);
    let before_w1 = InsertionPoint {
        before: Some("w1".into()),
    };
    session.start_recording(before_w1).unwrap();
    harness.audio.play(&[0.1; 480]);
    session.stop_recording().unwrap();

    harness.transcriber.hear(&[("Hi", 0, 300)]);
    session.poll().unwrap();
    harness.transcriber.hear(&[("Oh,", 0, 300)]);
    session.poll().unwrap();

    assert_eq!(texts(&session.state()), ["Oh,", "Hi", "Typed"]);
}

#[test]
fn the_last_new_word_keeps_the_break_after_the_range() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    re_record(&harness, &mut session, &["w1", "w2"]);

    harness
        .transcriber
        .hear(&[("Hi", 0, 300), ("all.", 400, 700)]);
    session.poll().unwrap();

    let breaks: Vec<_> = (session.state().words.iter())
        .map(|word| word.word.break_after)
        .collect();
    assert_eq!(breaks, [None, Some(BreakAfter::Paragraph), None]);
}

#[test]
fn a_range_deleted_while_pending_lands_as_an_insertion_between_its_neighbours() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    re_record(&harness, &mut session, &["w2"]);
    session
        .edit(Edit::Delete {
            words: ids(&["w2"]),
        })
        .unwrap();

    harness.transcriber.hear(&[("planet.", 0, 400)]);
    session.poll().unwrap();

    assert_eq!(texts(&session.state()), ["Hello,", "planet.", "Typed"]);
}

#[test]
fn a_re_record_needs_words_that_are_in_the_script() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.open_recording_bar(InputChoice::default());

    let nothing = session.start_re_recording(&[]).unwrap_err();
    let unknown = session.start_re_recording(&ids(&["w9"])).unwrap_err();

    assert!(matches!(
        nothing,
        CaptureError::Script(EditError::NothingSelected)
    ));
    assert!(matches!(
        unknown,
        CaptureError::Script(EditError::UnknownWord(_))
    ));
    assert!(
        session
            .state()
            .recording_bar
            .is_some_and(|bar| !bar.recording)
    );
}

#[test]
fn a_range_re_recorded_as_one_word_gives_it_all_the_ranges_events() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    insert_event(&mut session, "intro", "w1", 0);
    re_record(&harness, &mut session, &["w1", "w2", "w3"]);

    harness.transcriber.hear(&[("Hi.", 0, 300)]);
    session.poll().unwrap();

    assert_eq!(
        anchored(&session.state())[1..],
        [("confetti", "Hi.", 800), ("intro", "Hi.", 0)]
    );
}

#[test]
fn words_a_pending_re_record_replaces_cannot_be_re_recorded_again() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    re_record(&harness, &mut session, &["w1", "w2"]);

    let overlapping = session.start_re_recording(&ids(&["w2", "w3"])).unwrap_err();

    assert!(matches!(overlapping, CaptureError::AlreadyReRecorded(word) if word == "w2"));
}
