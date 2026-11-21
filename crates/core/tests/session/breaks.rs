use ttp_core::script::{BreakAfter, Edit};

use crate::support::Harness;

fn set_break(
    session: &mut ttp_core::session::Session,
    word: &str,
    break_after: Option<BreakAfter>,
) {
    session
        .edit(Edit::SetBreak {
            word: word.into(),
            break_after,
        })
        .unwrap();
}

#[test]
fn a_break_is_set_on_a_word_and_changes_nothing_else() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let before = session.state();

    set_break(&mut session, "w1", Some(BreakAfter::Line));
    let line = session.state();
    set_break(&mut session, "w1", Some(BreakAfter::Paragraph));
    let paragraph = session.state();
    set_break(&mut session, "w2", None);
    let cleared = session.state();

    assert_eq!(line.words[0].word.break_after, Some(BreakAfter::Line));
    assert_eq!(
        paragraph.words[0].word.break_after,
        Some(BreakAfter::Paragraph)
    );
    assert_eq!(cleared.words[1].word.break_after, None);
    let timing = |state: &ttp_core::session::SessionState| {
        state
            .words
            .iter()
            .map(|w| (w.start, w.word.duration))
            .collect::<Vec<_>>()
    };
    assert_eq!(timing(&cleared), timing(&before));
    assert_eq!(cleared.script_end, before.script_end);
}
