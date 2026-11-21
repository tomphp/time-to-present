use std::collections::HashSet;

use proptest::prelude::*;
use ttp_core::script::{Anchor, BreakAfter, Edit};
use ttp_core::session::{Session, SessionState};

use crate::support::Harness;

/// An edit described by positions, resolved against whatever the Script holds at the time.
#[derive(Debug, Clone)]
enum Step {
    Correct(usize, String),
    Split(usize, usize),
    Merge(usize),
    Delete(Vec<usize>),
    SetBreak(usize, Option<BreakAfter>),
    Insert(Option<usize>, String),
    InsertEvent(Option<usize>, i64),
    Undo,
    Redo,
}

fn word_text() -> impl Strategy<Value = String> {
    "[a-z]{1,8}[.,!?]?"
}

fn step() -> impl Strategy<Value = Step> {
    prop_oneof![
        (any::<usize>(), word_text()).prop_map(|(w, t)| Step::Correct(w, t)),
        (any::<usize>(), any::<usize>()).prop_map(|(w, at)| Step::Split(w, at)),
        any::<usize>().prop_map(Step::Merge),
        prop::collection::vec(any::<usize>(), 1..4).prop_map(Step::Delete),
        (
            any::<usize>(),
            prop::option::of(prop_oneof![
                Just(BreakAfter::Line),
                Just(BreakAfter::Paragraph)
            ])
        )
            .prop_map(|(w, b)| Step::SetBreak(w, b)),
        (prop::option::of(any::<usize>()), word_text()).prop_map(|(w, t)| Step::Insert(w, t)),
        (prop::option::of(any::<usize>()), -2000i64..2000)
            .prop_map(|(w, offset)| Step::InsertEvent(w, offset)),
        Just(Step::Undo),
        Just(Step::Redo),
    ]
}

fn resolve(step: &Step, state: &SessionState) -> Option<Edit> {
    let ids: Vec<&str> = state.words.iter().map(|w| w.word.id.as_str()).collect();
    let pick = |n: &usize| ids[n % ids.len()].to_string();
    if ids.is_empty() {
        return match step {
            Step::Insert(_, text) => Some(Edit::InsertWord {
                after: None,
                text: text.clone(),
            }),
            Step::InsertEvent(_, offset) => Some(insert_event(Anchor::ScriptStart, *offset)),
            _ => None,
        };
    }
    Some(match step {
        Step::Correct(w, text) => Edit::Correct {
            word: pick(w),
            text: text.clone(),
        },
        Step::Split(w, at) => {
            let length = state.words[w % ids.len()].word.text.chars().count();
            Edit::Split {
                word: pick(w),
                at: 1 + at % length.max(1),
            }
        }
        Step::Merge(w) => Edit::Merge { word: pick(w) },
        Step::Delete(ws) => Edit::Delete {
            words: ws.iter().map(pick).collect(),
        },
        Step::SetBreak(w, b) => Edit::SetBreak {
            word: pick(w),
            break_after: *b,
        },
        Step::Insert(w, text) => Edit::InsertWord {
            after: w.as_ref().map(pick),
            text: text.clone(),
        },
        Step::InsertEvent(w, offset) => {
            let anchor = w
                .as_ref()
                .map_or(Anchor::ScriptStart, |w| Anchor::Word(pick(w)));
            insert_event(anchor, *offset)
        }
        Step::Undo | Step::Redo => return None,
    })
}

fn insert_event(anchor: Anchor, offset: i64) -> Edit {
    Edit::InsertEvent {
        anchor,
        offset,
        name: "cue".into(),
        data: None,
    }
}

/// Runs a step, returning how many Named Events an edit added, or None for undo and redo.
fn run(session: &mut Session, step: &Step) -> Option<usize> {
    match step {
        Step::Undo => session.undo(),
        Step::Redo => session.redo(),
        _ => {
            let edit = resolve(step, &session.state());
            let inserts_event = matches!(edit, Some(Edit::InsertEvent { .. }));
            let applied = edit.is_some_and(|edit| session.edit(edit).is_ok());
            return Some(usize::from(inserts_event && applied));
        }
    }
    None
}

fn assert_script_times_monotonic(state: &SessionState) {
    let mut previous_end = 0;
    for timed in &state.words {
        assert!(timed.word.gap >= 0 && timed.word.duration >= 0, "{timed:?}");
        assert!(
            timed.start >= previous_end,
            "{timed:?} starts before {previous_end}"
        );
        previous_end = timed.start + timed.word.duration;
    }
}

/// An edit keeps every Named Event it does not add; each resolves to a Word or the Script start.
/// Undo and redo only bring back a Script that was already checked.
fn assert_every_event_resolves(state: &SessionState, before: usize, added: Option<usize>) {
    if let Some(added) = added {
        assert_eq!(
            state.named_events.len(),
            before + added,
            "an event stopped resolving"
        );
    }
    for timed in &state.named_events {
        if let Anchor::Word(id) = &timed.event.anchor {
            assert!(state.words.iter().any(|w| &w.word.id == id), "{timed:?}");
        }
    }
}

fn assert_ids_unique(state: &SessionState) {
    let mut seen = HashSet::new();
    for id in all_ids(state) {
        assert!(seen.insert(id), "id {id} appears twice");
    }
}

fn all_ids(state: &SessionState) -> impl Iterator<Item = &String> {
    let words = state.words.iter().map(|w| &w.word.id);
    words.chain(state.named_events.iter().map(|e| &e.event.id))
}

/// Undo and redo bring Words back under their old ids; any other step may only mint new ones.
fn assert_minted_ids_fresh(
    step: &Step,
    state: &SessionState,
    before: &HashSet<String>,
    ever: &mut HashSet<String>,
) {
    let restores = matches!(step, Step::Undo | Step::Redo);
    for id in ids_of(state) {
        if !restores && !before.contains(&id) {
            assert!(!ever.contains(&id), "id {id} was reused");
        }
        ever.insert(id);
    }
}

fn ids_of(state: &SessionState) -> HashSet<String> {
    all_ids(state).cloned().collect()
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn every_edit_sequence_keeps_script_times_monotonic_ids_fresh_events_resolving_and_undo_redo_an_identity(
        fixture in prop_oneof![Just("hello-world"), Just("spoken-only")],
        steps in prop::collection::vec(step(), 1..30),
    ) {
        let (harness, folder) = Harness::with_fixture(fixture);
        let mut session = harness.open(&folder);
        let mut ever = ids_of(&session.state());

        for step in &steps {
            let before = session.state();
            let added = run(&mut session, step);

            let state = session.state();
            assert_script_times_monotonic(&state);
            assert_every_event_resolves(&state, before.named_events.len(), added);
            assert_ids_unique(&state);
            assert_minted_ids_fresh(step, &state, &ids_of(&before), &mut ever);
            session.undo();
            if session.state() != state {
                session.redo();
                prop_assert_eq!(session.state(), state);
            }
        }
    }
}
