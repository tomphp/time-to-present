use std::sync::{Arc, Mutex};

use ttp_core::capture::InputChoice;
use ttp_core::models::Progress;
use ttp_core::script::Edit;
use ttp_core::session::{
    InsertionPoint, PendingPassage, PendingPassageError, PendingStatus, Session,
};
use ttp_core::transcription::TranscriptionEvent;

use crate::support::{Harness, starts};

fn before(word: &str) -> InsertionPoint {
    InsertionPoint {
        before: Some(word.into()),
    }
}

fn record(harness: &Harness, session: &mut Session, at: InsertionPoint) -> String {
    if session.state().recording_bar.is_none() {
        session.open_recording_bar(InputChoice::default());
    }
    session.start_recording(at).unwrap();
    harness.audio.play(&[0.1; 480]);
    session.stop_recording().unwrap().id
}

#[test]
fn stop_queues_a_pending_passage_at_the_insertion_point_and_hands_the_wav_to_the_transcriber() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    let recording = record(&harness, &mut session, before("w2"));

    assert_eq!(recording, "r2");
    assert_eq!(
        session.state().pending_passages,
        [PendingPassage {
            recording_id: "r2".into(),
            after: Some("w1".into()),
            before: Some("w2".into()),
            status: PendingStatus::Queued,
        }]
    );
    assert_eq!(harness.transcriber.audio_files(), ["r2.wav"]);
    assert_eq!(harness.transcriber.jobs()[0].prompt, None);
}

#[test]
fn the_insertion_point_defaults_to_the_end_of_the_script() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    record(&harness, &mut session, InsertionPoint::default());

    let passage = &session.state().pending_passages[0];
    assert_eq!(
        (passage.after.as_deref(), passage.before.as_deref()),
        (Some("w3"), None)
    );
}

fn status(session: &Session) -> PendingStatus {
    session.state().pending_passages[0].status.clone()
}

#[test]
fn progress_and_model_fetching_show_on_the_pending_passage_once_ticked() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, before("w2"));

    harness
        .transcriber
        .report(TranscriptionEvent::Model(Progress {
            downloaded: 25,
            total: Some(100),
        }));
    assert_eq!(status(&session), PendingStatus::Queued);
    session.tick().unwrap();
    assert_eq!(
        status(&session),
        PendingStatus::FetchingModel { percent: Some(25) }
    );

    harness.transcriber.progress(40);
    session.tick().unwrap();
    assert_eq!(
        status(&session),
        PendingStatus::Transcribing { percent: 40 }
    );
}

#[test]
fn heard_words_replace_the_pending_passage_with_inner_gaps_from_the_audio_as_one_undo_step() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state();
    record(&harness, &mut session, before("w2"));

    harness
        .transcriber
        .hear(&[("brave", 500, 800), ("new", 900, 1100)]);
    session.tick().unwrap();

    let state = session.state();
    assert!(state.pending_passages.is_empty());
    assert_eq!(
        starts(&state),
        [
            ("Hello,", 400),
            ("brave", 850),
            ("new", 1250),
            ("world.", 1600),
            ("Typed", 2150)
        ]
    );
    let brave = &state.words[1].word;
    assert_eq!(
        (
            brave.recording_id.as_deref(),
            brave.audio_start,
            brave.audio_end,
            brave.confidence,
            brave.gap,
            brave.duration
        ),
        (Some("r2"), Some(500), Some(800), Some(0.9), 150, 300)
    );
    assert_eq!(state.words[2].word.gap, 100);
    assert_eq!(state.words[3].word.gap, 150);

    session.undo();
    assert_eq!(session.state().words, original.words);
}

#[test]
fn a_passage_inserted_before_the_first_word_takes_its_gap_and_that_word_keeps_its_own() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, before("w1"));

    harness.transcriber.hear(&[("Oh,", 1000, 1200)]);
    session.tick().unwrap();

    assert_eq!(
        starts(&session.state()),
        [
            ("Oh,", 400),
            ("Hello,", 1000),
            ("world.", 1450),
            ("Typed", 2000)
        ]
    );
}

#[test]
fn landing_publishes_the_new_words_with_the_other_passage_at_the_same_spot_already_re_anchored() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    record(&harness, &mut session, InsertionPoint::default());
    record(&harness, &mut session, InsertionPoint::default());
    harness.transcriber.fail("hiccup");
    session.tick().unwrap();
    let published = Arc::new(Mutex::new(Vec::new()));
    let sink = published.clone();
    session.subscribe(move |state| sink.lock().unwrap().push(state.clone()));

    harness.transcriber.hear(&[("second", 100, 400)]);
    session.tick().unwrap();

    let published = published.lock().unwrap();
    let landed: Vec<_> = published
        .iter()
        .filter(|state| !state.words.is_empty())
        .collect();
    assert!(!landed.is_empty());
    for state in landed {
        let second = state.words[0].word.id.clone();
        assert_eq!(state.pending_passages.len(), 1);
        assert_eq!(state.pending_passages[0].before, Some(second));
    }
}

#[test]
fn a_passage_appended_to_a_non_empty_script_gets_a_500_ms_seam_gap_and_its_edge_silence_is_ignored()
{
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, InsertionPoint::default());

    harness
        .transcriber
        .hear(&[("Thanks", 3_000, 3_400), ("all.", 3_600, 3_900)]);
    session.tick().unwrap();

    let state = session.state();
    assert_eq!(starts(&state)[3..], [("Thanks", 2_200), ("all.", 2_800)]);
    assert_eq!(state.words[3].word.gap, 500);
}

#[test]
fn the_first_recording_into_an_empty_script_keeps_its_lead_in_capped_at_2_s() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    record(&harness, &mut session, InsertionPoint::default());
    harness.transcriber.hear(&[("Hi", 700, 900)]);
    session.tick().unwrap();
    assert_eq!(starts(&session.state()), [("Hi", 700)]);

    session.undo();
    record(&harness, &mut session, InsertionPoint::default());
    harness.transcriber.hear(&[("Hi", 5_000, 5_300)]);
    session.tick().unwrap();
    assert_eq!(starts(&session.state()), [("Hi", 2_000)]);
}

#[test]
fn a_second_recording_queues_behind_the_first_and_lands_after_it_in_order() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, before("w2"));
    record(&harness, &mut session, before("w2"));

    let state = session.state();
    assert_eq!(state.pending_passages.len(), 2);
    assert_eq!(harness.transcriber.audio_files(), ["r2.wav"]);

    harness.transcriber.hear(&[("one", 100, 400)]);
    session.tick().unwrap();
    assert_eq!(harness.transcriber.audio_files(), ["r2.wav", "r3.wav"]);
    assert_eq!(session.state().pending_passages.len(), 1);

    harness.transcriber.hear(&[("two", 100, 400)]);
    session.tick().unwrap();
    assert_eq!(
        starts(&session.state()),
        [
            ("Hello,", 400),
            ("one", 850),
            ("two", 1300),
            ("world.", 1750),
            ("Typed", 2300)
        ]
    );
}

#[test]
fn the_rest_of_the_script_stays_editable_and_the_passage_still_lands_between_its_neighbours() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, before("w2"));

    session
        .edit(Edit::Correct {
            word: "w1".into(),
            text: "Hullo,".into(),
        })
        .unwrap();
    session
        .edit(Edit::Delete {
            words: vec!["w2".into()],
        })
        .unwrap();
    harness.transcriber.hear(&[("brave", 500, 800)]);
    session.tick().unwrap();

    assert_eq!(
        starts(&session.state()),
        [("Hullo,", 400), ("brave", 850), ("Typed", 1300)]
    );
}

#[test]
fn a_failed_transcription_splices_nothing_and_offers_retry() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let original = session.state().words;
    record(&harness, &mut session, before("w2"));

    harness.transcriber.fail("the sidecar crashed");
    session.tick().unwrap();
    assert_eq!(
        status(&session),
        PendingStatus::Failed {
            reason: "the sidecar crashed".into()
        }
    );
    assert_eq!(session.state().words, original);
    assert!(folder.join("recordings/r2.wav").is_file());

    session.retry_transcription("r2").unwrap();
    assert_eq!(status(&session), PendingStatus::Queued);
    assert_eq!(harness.transcriber.audio_files(), ["r2.wav", "r2.wav"]);
    harness.transcriber.hear(&[("brave", 500, 800)]);
    session.tick().unwrap();
    assert_eq!(starts(&session.state())[1], ("brave", 850));
}

#[test]
fn no_speech_found_is_a_failure_and_discard_removes_the_passage_and_its_wav() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, before("w2"));

    harness.transcriber.no_speech();
    session.tick().unwrap();
    assert_eq!(
        status(&session),
        PendingStatus::Failed {
            reason: "No speech found".into()
        }
    );

    session.discard_transcription("r2").unwrap();
    assert!(session.state().pending_passages.is_empty());
    assert!(!folder.join("recordings/r2.wav").exists());
    let saved = std::fs::read_to_string(folder.join("presentation.json")).unwrap();
    assert!(!saved.contains("r2"), "{saved}");
}

#[test]
fn discarding_a_running_transcription_abandons_it_and_starts_the_next() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, before("w2"));
    record(&harness, &mut session, before("w2"));

    session.discard_transcription("r2").unwrap();

    assert_eq!(harness.transcriber.audio_files(), ["r2.wav", "r3.wav"]);
    assert_eq!(session.state().pending_passages[0].recording_id, "r3");
}

#[test]
fn retry_needs_a_failed_passage_and_discard_a_pending_one() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, before("w2"));

    assert!(matches!(
        session.retry_transcription("r2").unwrap_err(),
        PendingPassageError::NotFailed(_)
    ));
    assert!(matches!(
        session.discard_transcription("r9").unwrap_err(),
        PendingPassageError::UnknownPassage(_)
    ));
}

#[test]
fn closing_the_session_abandons_the_running_transcription() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, before("w2"));
    assert!(harness.transcriber.is_running());

    drop(session);

    assert!(!harness.transcriber.is_running());
}

#[test]
fn two_recordings_appended_one_after_the_other_land_in_the_order_they_were_made() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, InsertionPoint::default());
    record(&harness, &mut session, InsertionPoint::default());

    harness.transcriber.hear(&[("one", 100, 400)]);
    session.tick().unwrap();
    harness.transcriber.hear(&[("two", 100, 400)]);
    session.tick().unwrap();

    assert_eq!(
        starts(&session.state())[3..],
        [("one", 2_200), ("two", 3_000)]
    );
}

#[test]
fn a_retried_earlier_recording_still_lands_before_a_later_one_at_the_same_spot() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    record(&harness, &mut session, InsertionPoint::default());
    record(&harness, &mut session, InsertionPoint::default());
    harness.transcriber.fail("hiccup");
    session.tick().unwrap();
    harness.transcriber.hear(&[("second", 100, 400)]);
    session.tick().unwrap();

    session.retry_transcription("r1").unwrap();
    harness.transcriber.hear(&[("first", 300, 600)]);
    session.tick().unwrap();

    assert_eq!(starts(&session.state()), [("first", 100), ("second", 500)]);
}

#[test]
fn a_transcription_with_no_words_counts_as_no_speech_found() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, before("w2"));

    harness.transcriber.hear(&[]);
    session.tick().unwrap();

    assert_eq!(
        status(&session),
        PendingStatus::Failed {
            reason: "No speech found".into()
        }
    );
}

#[test]
fn discard_unregisters_the_recording_even_when_its_wav_is_already_gone() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    record(&harness, &mut session, before("w2"));
    std::fs::remove_file(folder.join("recordings/r2.wav")).unwrap();

    session.discard_transcription("r2").unwrap();

    assert!(session.state().pending_passages.is_empty());
    let saved = std::fs::read_to_string(folder.join("presentation.json")).unwrap();
    assert!(!saved.contains("r2"), "{saved}");
}
