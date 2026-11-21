use ttp_core::script::Edit;

use crate::support::{Harness, word_starts};

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
