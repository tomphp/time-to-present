use ttp_core::script::{Edit, EditError};
use ttp_core::session::Session;

use crate::support::{Harness, starts};

fn hello_world() -> (Harness, Session) {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let session = harness.open(&folder);
    (harness, session)
}

fn retime(words: &[&str], percent: f64) -> Edit {
    Edit::Retime {
        words: words.iter().map(|id| id.to_string()).collect(),
        percent,
    }
}

fn gaps_and_durations(session: &Session) -> Vec<(i64, i64)> {
    let words = session.state().words;
    words
        .iter()
        .map(|w| (w.word.gap, w.word.duration))
        .collect()
}

#[test]
fn retime_scales_durations_and_gaps_except_the_first_selected_words_gap() {
    let (_harness, mut session) = hello_world();

    session.edit(retime(&["w2", "w3"], 150.0)).unwrap();

    assert_eq!(
        gaps_and_durations(&session),
        [(400, 300), (150, 675), (150, 450)]
    );
}

#[test]
fn retime_rounds_to_whole_milliseconds() {
    let (_harness, mut session) = hello_world();

    session.edit(retime(&["w1", "w2", "w3"], 33.3)).unwrap();

    assert_eq!(
        gaps_and_durations(&session),
        [(400, 100), (50, 150), (33, 100)]
    );
}

#[test]
fn retime_ripples_the_words_after_the_selection() {
    let (_harness, mut session) = hello_world();

    session.edit(retime(&["w1"], 200.0)).unwrap();

    assert_eq!(
        starts(&session.state()),
        [("Hello,", 400), ("world.", 1150), ("Typed", 1700)]
    );
}

#[test]
fn retime_is_one_undo_step() {
    let (_harness, mut session) = hello_world();
    let original = session.state();

    session.edit(retime(&["w1", "w2"], 50.0)).unwrap();
    session.undo();

    assert_eq!(session.state(), original);
}

#[test]
fn retime_needs_words_and_a_positive_percentage() {
    let (_harness, mut session) = hello_world();

    assert_eq!(
        session.edit(retime(&[], 120.0)),
        Err(EditError::NothingSelected)
    );
    assert_eq!(
        session.edit(retime(&["w1"], 0.0)),
        Err(EditError::InvalidPercent)
    );
    assert_eq!(
        session.edit(retime(&["nope"], 120.0)),
        Err(EditError::UnknownWord("nope".into()))
    );
}
