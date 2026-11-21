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
    Cut(Vec<usize>),
    Copy(Vec<usize>),
    /// Pastes over some Words the clipboard's passage, or plain text when it holds none or
    /// this is false.
    Paste(Option<usize>, Vec<usize>, bool, String),
    Timing(Gesture, usize, i64),
    Drag(u8, Gesture, usize, i64),
    Undo,
    Redo,
}

#[derive(Debug, Clone, Copy)]
enum Gesture {
    Move,
    TrimStart,
    TrimEnd,
}

fn gesture() -> impl Strategy<Value = Gesture> {
    prop_oneof![
        Just(Gesture::Move),
        Just(Gesture::TrimStart),
        Just(Gesture::TrimEnd)
    ]
}

fn timing_edit(gesture: Gesture, word: String, by: i64) -> Edit {
    match gesture {
        Gesture::Move => Edit::Move { word, by },
        Gesture::TrimStart => Edit::TrimStart { word, by },
        Gesture::TrimEnd => Edit::TrimEnd { word, by },
    }
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
        prop::collection::vec(any::<usize>(), 1..4).prop_map(Step::Cut),
        prop::collection::vec(any::<usize>(), 1..4).prop_map(Step::Copy),
        (
            prop::option::of(any::<usize>()),
            prop::collection::vec(any::<usize>(), 0..3),
            any::<bool>(),
            "[a-z]{1,8}( [a-z]{1,8}){0,2}"
        )
            .prop_map(|(w, replacing, internal, text)| Step::Paste(w, replacing, internal, text)),
        (gesture(), any::<usize>(), -2000..2000i64).prop_map(|(g, w, by)| Step::Timing(g, w, by)),
        (0..2u8, gesture(), any::<usize>(), -2000..2000i64)
            .prop_map(|(d, g, w, by)| Step::Drag(d, g, w, by)),
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
        Step::Timing(gesture, w, by) | Step::Drag(_, gesture, w, by) => {
            timing_edit(*gesture, pick(w), *by)
        }
        Step::Cut(_) | Step::Copy(_) | Step::Paste(..) | Step::Undo | Step::Redo => return None,
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

/// What the test knows the clipboard holds: its text, its Named Events, and the ids a cut
/// took out, which its first paste may bring back.
#[derive(Default)]
struct Clipboard {
    text: Option<String>,
    events: usize,
    cut_ids: HashSet<String>,
}

impl Clipboard {
    fn hold(&mut self, words: &[String], state: &SessionState, cut: bool) {
        let held = |id: &String| words.contains(id);
        let texts: Vec<&str> = state
            .words
            .iter()
            .filter(|w| held(&w.word.id))
            .map(|w| w.word.text.as_str())
            .collect();
        let events = state
            .named_events
            .iter()
            .filter(|e| matches!(&e.event.anchor, Anchor::Word(id) if held(id)));
        let event_ids: Vec<String> = events.map(|e| e.event.id.clone()).collect();
        self.text = Some(texts.join(" "));
        self.events = event_ids.len();
        self.cut_ids = if cut {
            words.iter().cloned().chain(event_ids).collect()
        } else {
            HashSet::new()
        };
    }
}

/// What a step did to the Named Events: how many it added, less those it took away.
enum Outcome {
    Restored,
    Events(isize),
}

fn pick_words(ws: &[usize], state: &SessionState) -> Vec<String> {
    ws.iter()
        .map(|n| state.words[n % state.words.len()].word.id.clone())
        .collect()
}

/// Runs a step, returning the ids it may bring back alongside what it did to the events.
fn run(
    session: &mut Session,
    clipboard: &mut Clipboard,
    step: &Step,
) -> (Outcome, HashSet<String>) {
    let state = session.state();
    let none = HashSet::new();
    match step {
        Step::Undo => session.undo(),
        Step::Redo => session.redo(),
        Step::Cut(ws) | Step::Copy(ws) if !state.words.is_empty() => {
            let words = pick_words(ws, &state);
            let cut = matches!(step, Step::Cut(_));
            let held = if cut {
                session.cut(&words)
            } else {
                session.copy(&words)
            };
            held.unwrap();
            clipboard.hold(&words, &state, cut);
            let taken = if cut { clipboard.events as isize } else { 0 };
            return (Outcome::Events(-taken), none);
        }
        Step::Cut(_) | Step::Copy(_) => return (Outcome::Events(0), none),
        Step::Paste(w, replacing, internal, text) => {
            let after = w
                .as_ref()
                .filter(|_| !state.words.is_empty())
                .map(|n| state.words[n % state.words.len()].word.id.clone());
            let mut replacing = if state.words.is_empty() {
                Vec::new()
            } else {
                pick_words(replacing, &state)
            };
            replacing.retain(|id| Some(id) != after.as_ref());
            let passage = clipboard.text.clone().filter(|_| *internal);
            let text = passage.clone().unwrap_or_else(|| text.clone());
            session.paste(after, &replacing, &text).unwrap();
            if passage.is_none() {
                return (Outcome::Events(0), none);
            }
            let restorable = std::mem::take(&mut clipboard.cut_ids);
            return (Outcome::Events(clipboard.events as isize), restorable);
        }
        Step::Drag(drag, ..) => {
            if let Some(edit) = resolve(step, &state) {
                let _ = session.drag(&format!("d{drag}"), edit);
            }
            return (Outcome::Events(0), none);
        }
        _ => {
            let edit = resolve(step, &state);
            let inserts_event = matches!(edit, Some(Edit::InsertEvent { .. }));
            let applied = edit.is_some_and(|edit| session.edit(edit).is_ok());
            return (Outcome::Events(isize::from(inserts_event && applied)), none);
        }
    }
    (Outcome::Restored, none)
}

/// Undoing between two steps of the same drag would end it, so the check waits for its last step.
fn continues_drag(step: &Step, next: Option<&Step>) -> bool {
    matches!((step, next), (Step::Drag(this, ..), Some(Step::Drag(next, ..))) if this == next)
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

/// An edit keeps every Named Event it does not add or cut; each resolves to a Word or the
/// Script start. Undo and redo only bring back a Script that was already checked.
fn assert_every_event_resolves(state: &SessionState, before: usize, outcome: &Outcome) {
    if let Outcome::Events(added) = outcome {
        assert_eq!(
            state.named_events.len() as isize,
            before as isize + added,
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

/// Undo and redo bring Words back under their old ids, and so does pasting a cut passage the
/// first time; any other step may only mint new ones.
fn assert_minted_ids_fresh(
    outcome: &Outcome,
    restorable: &HashSet<String>,
    state: &SessionState,
    before: &HashSet<String>,
    ever: &mut HashSet<String>,
) {
    let restores = matches!(outcome, Outcome::Restored);
    for id in ids_of(state) {
        if !restores && !before.contains(&id) && !restorable.contains(&id) {
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
        let mut clipboard = Clipboard::default();

        for (index, step) in steps.iter().enumerate() {
            let before = session.state();
            let (outcome, restorable) = run(&mut session, &mut clipboard, step);

            let state = session.state();
            assert_script_times_monotonic(&state);
            assert_every_event_resolves(&state, before.named_events.len(), &outcome);
            assert_ids_unique(&state);
            assert_minted_ids_fresh(&outcome, &restorable, &state, &ids_of(&before), &mut ever);
            if continues_drag(step, steps.get(index + 1)) {
                continue;
            }
            session.undo();
            if session.state() != state {
                session.redo();
                prop_assert_eq!(session.state(), state);
            }
        }
    }
}
