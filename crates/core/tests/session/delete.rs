use ttp_core::script::{Anchor, Edit};
use ttp_core::session::{Session, SessionState};

use crate::support::{Harness, word_starts};

fn mark(session: &mut Session, word: &str, offset: i64) {
    session
        .edit(Edit::InsertEvent {
            anchor: Anchor::Word(word.into()),
            offset,
            name: "cue".into(),
            data: None,
        })
        .unwrap();
}

/// The last Named Event's anchor, offset and Script Time.
fn last_event(state: &SessionState) -> (Anchor, i64, i64) {
    let timed = state.named_events.last().unwrap();
    (timed.event.anchor.clone(), timed.event.offset, timed.time)
}

fn delete(session: &mut ttp_core::session::Session, words: &[&str]) {
    session
        .edit(Edit::Delete {
            words: words.iter().map(|id| id.to_string()).collect(),
        })
        .unwrap();
}

#[test]
fn deleting_a_word_keeps_the_longer_surrounding_gap_and_ripples_everything_after_earlier() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    delete(&mut session, &["w2"]);

    let state = session.state();
    assert_eq!(
        word_starts(&state),
        [("w1", "Hello,", 400), ("w3", "Typed", 850)]
    );
    assert_eq!(state.words[1].word.gap, 150);
}

#[test]
fn deleting_the_first_word_gives_the_next_one_the_longer_of_the_lead_in_and_its_own_gap() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    delete(&mut session, &["w1"]);

    assert_eq!(
        word_starts(&session.state()),
        [("w2", "world.", 400), ("w3", "Typed", 950)]
    );
}

#[test]
fn deleting_a_run_of_words_drops_the_gaps_inside_the_run() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session
        .edit(Edit::Split {
            word: "w2".into(),
            at: 3,
        })
        .unwrap();

    let split_off = session.state().words[2].word.id.clone();

    delete(&mut session, &["w2", &split_off]);

    let state = session.state();
    assert_eq!(
        word_starts(&state),
        [("w1", "Hello,", 400), ("w3", "Typed", 850)]
    );
}

#[test]
fn deleting_the_last_word_leaves_the_rest_untouched() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    delete(&mut session, &["w3"]);

    assert_eq!(
        word_starts(&session.state()),
        [("w1", "Hello,", 400), ("w2", "world.", 850)]
    );
}

#[test]
fn deleting_every_word_leaves_an_empty_script() {
    let (harness, folder) = Harness::with_fixture("spoken-only");
    let mut session = harness.open(&folder);

    delete(&mut session, &["w1", "w2"]);

    assert!(session.state().words.is_empty());
}

#[test]
fn an_event_on_a_deleted_word_keeps_its_distance_before_the_next_word() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    mark(&mut session, "w2", 500);

    delete(&mut session, &["w2"]);

    assert_eq!(
        last_event(&session.state()),
        (Anchor::Word("w3".into()), -50, 800)
    );
}

#[test]
fn an_event_on_a_deleted_word_after_the_next_words_start_stays_that_far_after_it() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    mark(&mut session, "w2", 1300);

    delete(&mut session, &["w2"]);

    assert_eq!(
        last_event(&session.state()),
        (Anchor::Word("w3".into()), 750, 1600)
    );
}

#[test]
fn an_event_on_a_deleted_word_never_sits_before_the_previous_words_end() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    mark(&mut session, "w2", 100);

    delete(&mut session, &["w2"]);

    assert_eq!(
        last_event(&session.state()),
        (Anchor::Word("w3".into()), -150, 700)
    );
}

#[test]
fn an_event_on_a_deleted_first_word_never_sits_before_the_script_start() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    mark(&mut session, "w1", 0);

    delete(&mut session, &["w1"]);

    assert_eq!(
        last_event(&session.state()),
        (Anchor::Word("w2".into()), -400, 0)
    );
}

#[test]
fn an_event_on_a_deleted_last_word_goes_to_the_previous_words_end() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    delete(&mut session, &["w2", "w3"]);

    assert_eq!(
        last_event(&session.state()),
        (Anchor::Word("w1".into()), 300, 700)
    );
}

#[test]
fn events_on_a_script_with_every_word_deleted_go_to_the_script_start() {
    let (harness, folder) = Harness::with_fixture("spoken-only");
    let mut session = harness.open(&folder);

    delete(&mut session, &["w1", "w2"]);

    assert_eq!(last_event(&session.state()), (Anchor::ScriptStart, 0, 0));
}
