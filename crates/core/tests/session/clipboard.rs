use ttp_core::script::{Anchor, BreakAfter, Edit, EditError};
use ttp_core::session::{Session, SessionState};

use crate::support::{Harness, starts, word_starts};

fn ids(words: &[&str]) -> Vec<String> {
    words.iter().map(|id| id.to_string()).collect()
}

fn paste(session: &mut Session, after: Option<&str>, text: &str) {
    session.paste(after.map(str::to_string), &[], text).unwrap();
}

fn events(state: &SessionState) -> Vec<(&str, &Anchor, i64, i64)> {
    state
        .named_events
        .iter()
        .map(|e| (e.event.id.as_str(), &e.event.anchor, e.event.offset, e.time))
        .collect()
}

#[test]
fn a_cut_closes_up_by_the_delete_rule_and_takes_the_words_events_with_it() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.cut(&ids(&["w2", "w3"])).unwrap();

    let state = session.state();
    assert_eq!(word_starts(&state), [("w1", "Hello,", 400)]);
    assert_eq!(events(&state), [("e1", &Anchor::ScriptStart, 0, 0)]);
    assert!(state.moved_events.is_empty());
}

#[test]
fn cut_and_paste_moves_the_words_under_their_ids_and_their_events_travel_with_a_moved_badge() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.cut(&ids(&["w3"])).unwrap();
    paste(&mut session, None, "Typed");

    let state = session.state();
    assert_eq!(
        word_starts(&state),
        [
            ("w3", "Typed", 400),
            ("w1", "Hello,", 1100),
            ("w2", "world.", 1550)
        ]
    );
    assert_eq!(
        events(&state)[1],
        ("e2", &Anchor::Word("w3".into()), 800, 1200)
    );
    assert_eq!(state.moved_events, ["e2"]);
}

#[test]
fn a_cut_closes_up_keeping_the_longer_surrounding_gap() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.cut(&ids(&["w2"])).unwrap();

    assert_eq!(starts(&session.state()), [("Hello,", 400), ("Typed", 850)]);
}

#[test]
fn pasted_words_keep_their_text_duration_audio_link_breaks_and_inner_gaps() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state().words;

    session.copy(&ids(&["w2", "w3"])).unwrap();
    paste(&mut session, Some("w3"), "world.\n\nTyped");

    let state = session.state();
    let (world, typed) = (&state.words[3].word, &state.words[4].word);
    assert_eq!(
        (
            &world.text,
            world.duration,
            &world.recording_id,
            world.audio_start,
            world.audio_end
        ),
        (
            &"world.".to_string(),
            450,
            &Some("r1".to_string()),
            Some(1650),
            Some(2100)
        )
    );
    assert_eq!(world.break_after, Some(BreakAfter::Paragraph));
    assert_eq!((typed.gap, typed.duration), (100, 300));
    assert_eq!(original[2].word.gap, state.words[2].word.gap);
}

#[test]
fn copy_and_paste_mints_new_ids_for_the_words_and_their_events_without_a_badge() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.copy(&ids(&["w3"])).unwrap();
    paste(&mut session, Some("w1"), "Typed");

    let state = session.state();
    let copy = &state.words[1].word;
    assert!(!["w1", "w2", "w3"].contains(&copy.id.as_str()));
    assert_eq!(copy.text, "Typed");
    let copied_event = &state.named_events[2].event;
    assert_ne!(copied_event.id, "e2");
    assert_eq!(
        (
            &copied_event.name,
            &copied_event.anchor,
            copied_event.offset
        ),
        (&"confetti".to_string(), &Anchor::Word(copy.id.clone()), 800)
    );
    assert_eq!(state.named_events.len(), 3);
    assert!(state.moved_events.is_empty());
}

#[test]
fn a_passage_between_two_words_takes_the_next_words_gap_which_keeps_its_own() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.copy(&ids(&["w3"])).unwrap();
    paste(&mut session, Some("w1"), "Typed");

    assert_eq!(
        starts(&session.state()),
        [
            ("Hello,", 400),
            ("Typed", 850),
            ("world.", 1300),
            ("Typed", 1850)
        ]
    );
}

#[test]
fn a_passage_at_the_end_gets_500_ms_and_into_an_empty_script_none() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.copy(&ids(&["w1"])).unwrap();
    paste(&mut session, Some("w3"), "Hello,");
    assert_eq!(session.state().words[3].start, 1700 + 500);

    session.cut(&ids(&["w1", "w2", "w3"])).unwrap();
    let copy = session.state().words[0].word.id.clone();
    session.cut(&[copy]).unwrap();
    paste(&mut session, None, "Hello,");
    assert_eq!(starts(&session.state()), [("Hello,", 0)]);
}

#[test]
fn pasting_a_cut_passage_again_mints_new_ids() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.cut(&ids(&["w3"])).unwrap();
    paste(&mut session, Some("w2"), "Typed");
    paste(&mut session, Some("w3"), "Typed");

    let state = session.state();
    assert_eq!(state.words[2].word.id, "w3");
    assert_ne!(state.words[3].word.id, "w3");
    assert_ne!(state.named_events[2].event.id, "e2");
}

#[test]
fn a_cut_passage_pasted_after_its_words_came_back_by_undo_mints_new_ids() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.cut(&ids(&["w3"])).unwrap();
    session.undo().unwrap();
    paste(&mut session, Some("w3"), "Typed");

    let state = session.state();
    assert_eq!(state.words.len(), 4);
    assert_ne!(state.words[3].word.id, "w3");
}

#[test]
fn undoing_a_move_takes_back_the_paste_and_its_badges_then_the_cut() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();

    session.cut(&ids(&["w3"])).unwrap();
    paste(&mut session, None, "Typed");

    session.undo().unwrap();
    assert_eq!(session.state().words.len(), 2);
    assert!(session.state().moved_events.is_empty());
    session.undo().unwrap();
    assert_eq!(session.state(), original);
}

#[test]
fn copying_changes_nothing_and_takes_no_undo_step() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.cut(&ids(&["w1"])).unwrap();
    let cut = session.state();

    session.copy(&ids(&["w2"])).unwrap();
    assert_eq!(session.state(), cut);

    session.undo().unwrap();
    assert_eq!(session.state().words.len(), 3);
}

#[test]
fn text_that_is_not_the_clipboards_passage_pastes_as_typed_words() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.copy(&ids(&["w3"])).unwrap();

    paste(&mut session, Some("w1"), "big bright");

    let state = session.state();
    assert_eq!(
        starts(&state),
        [
            ("Hello,", 400),
            ("big", 850),
            ("bright", 1188),
            ("world.", 1713),
            ("Typed", 2263)
        ]
    );
    let typed = &state.words[1].word;
    assert_eq!(
        (typed.recording_id.as_deref(), typed.audio_start),
        (None, None)
    );
    assert_eq!(state.named_events.len(), 2);
}

#[test]
fn pasted_plain_text_into_an_empty_script_starts_at_zero_and_keeps_its_line_breaks() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");

    paste(&mut session, None, "\nOne two\r\nthree\n\n\nfour  \n");

    let state = session.state();
    let words: Vec<(&str, Option<BreakAfter>)> = state
        .words
        .iter()
        .map(|w| (w.word.text.as_str(), w.word.break_after))
        .collect();
    assert_eq!(
        words,
        [
            ("One", None),
            ("two", Some(BreakAfter::Line)),
            ("three", Some(BreakAfter::Paragraph)),
            ("four", None)
        ]
    );
    assert_eq!(state.words[0].start, 0);
    assert_eq!(state.words[1].word.gap, 100);
}

#[test]
fn pasting_whitespace_changes_nothing() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();

    paste(&mut session, Some("w1"), " \n ");

    assert_eq!(session.state(), original);
    session.undo().unwrap();
    assert_eq!(session.state(), original);
}

#[test]
fn unknown_words_and_empty_selections_are_refused_leaving_the_script_untouched() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();

    assert_eq!(
        session.cut(&ids(&["w1", "nope"])),
        Err(EditError::UnknownWord("nope".into()))
    );
    assert_eq!(session.copy(&[]), Err(EditError::NothingSelected));
    session.copy(&ids(&["w1"])).unwrap();
    assert_eq!(
        session.paste(Some("nope".into()), &[], "Hello,"),
        Err(EditError::UnknownWord("nope".into()))
    );
    assert_eq!(
        session.paste(Some("nope".into()), &[], "other"),
        Err(EditError::UnknownWord("nope".into()))
    );

    assert_eq!(session.state(), original);
}

#[test]
fn a_pasted_event_before_its_first_word_never_sits_before_the_seam_gap() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session
        .edit(Edit::InsertEvent {
            anchor: Anchor::Word("w1".into()),
            offset: -400,
            name: "early".into(),
            data: None,
        })
        .unwrap();

    session.cut(&ids(&["w1", "w2", "w3"])).unwrap();
    paste(&mut session, None, "Hello, world. Typed");

    let early = session.state().named_events.last().unwrap().clone();
    assert_eq!((early.event.offset, early.time), (0, 0));
}

#[test]
fn pasting_over_words_replaces_them_in_one_undo_step() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();
    session.copy(&ids(&["w1"])).unwrap();

    session
        .paste(Some("w1".into()), &ids(&["w2"]), "Hello,")
        .unwrap();
    assert_eq!(
        starts(&session.state()),
        [("Hello,", 400), ("Hello,", 850), ("Typed", 1300)]
    );
    assert!(session.state().moved_events.is_empty());

    session.paste(None, &ids(&["w3"]), "Fresh").unwrap();
    assert_eq!(session.state().words[0].word.text, "Fresh");
    assert_eq!(session.state().moved_events, ["e2"]);

    session.undo().unwrap();
    session.undo().unwrap();
    assert_eq!(session.state(), original);
}

#[test]
fn the_clipboard_pastes_its_passage_as_often_as_asked() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.cut(&ids(&["w3"])).unwrap();

    for _ in 0..3 {
        paste(&mut session, None, "Typed");
    }

    let state = session.state();
    assert_eq!(state.words.len(), 5);
    assert_eq!(state.named_events.len(), 4);
}
