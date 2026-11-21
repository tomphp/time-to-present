use ttp_core::capture::{CaptureError, InputChoice};
use ttp_core::models::Progress;
use ttp_core::script::{Edit, EditError};
use ttp_core::session::{InsertionPoint, LiveTranscript, Session};
use ttp_core::transcription::{LiveEvent, LiveModel};

use crate::support::Harness;

fn transcript(session: &Session) -> LiveTranscript {
    session.state().live_transcript.expect("a Live Transcript")
}

fn texts(session: &Session) -> Vec<String> {
    transcript(session).words
}

fn open_hello_world() -> (Harness, Session) {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let session = harness.open(&folder);
    (harness, session)
}

fn start_before(session: &mut Session, word: &str) {
    session.open_recording_bar(InputChoice::default());
    session
        .start_recording(InsertionPoint {
            before: Some(word.into()),
        })
        .unwrap();
}

#[test]
fn while_recording_the_16_khz_feed_streams_into_the_live_transcriber() {
    let (harness, mut session) = open_hello_world();
    start_before(&mut session, "w2");

    let ramp: Vec<f32> = (0..12).map(|i| i as f32 / 1_000.0).collect();
    harness.audio.play(&ramp[..5]);
    harness.audio.play(&ramp[5..]);

    assert_eq!(harness.live.heard(), [0.0, 0.003, 0.006, 0.009]);
}

#[test]
fn the_live_transcript_sits_at_the_insertion_point_and_revisions_replace_it_in_place() {
    let (harness, mut session) = open_hello_world();
    start_before(&mut session, "w2");
    assert_eq!(
        transcript(&session),
        LiveTranscript {
            after: Some("w1".into()),
            before: Some("w2".into()),
            words: vec![],
            failure: None,
        }
    );

    harness.live.revise(0, 0, &["The", "quick"]);
    session.poll().unwrap();
    assert_eq!(texts(&session), ["The", "quick"]);

    harness.live.revise(1, 1, &["quack", "brown"]);
    harness.live.revise(2, 2, &["brown,", "fox."]);
    session.poll().unwrap();
    assert_eq!(texts(&session), ["The", "quack", "brown,", "fox."]);
}

#[test]
fn live_transcript_words_never_enter_the_script() {
    let (harness, mut session) = open_hello_world();
    let script = session.state().words;
    start_before(&mut session, "w2");

    harness.live.revise(0, 2, &["The", "quick"]);
    session.poll().unwrap();
    assert_eq!(session.state().words, script);

    session.stop_recording().unwrap();
    session.poll().unwrap();
    assert_eq!(session.state().words, script);
    assert_eq!(session.state().live_transcript, None);
    assert!(!harness.live.is_live());
}

#[test]
fn cancelling_ends_the_live_transcript() {
    let (harness, mut session) = open_hello_world();
    start_before(&mut session, "w2");

    session.cancel_recording().unwrap();

    assert_eq!(session.state().live_transcript, None);
    assert!(!harness.live.is_live());
}

#[test]
fn a_live_failure_shows_on_the_transcript_and_the_recording_goes_on() {
    let (harness, mut session) = open_hello_world();
    start_before(&mut session, "w2");
    harness.live.revise(0, 0, &["The"]);

    harness
        .live
        .report(LiveEvent::Failed("the live model would not load".into()));
    session.poll().unwrap();

    let failed = transcript(&session);
    assert_eq!(failed.words, ["The"]);
    assert_eq!(
        failed.failure.as_deref(),
        Some("the live model would not load")
    );
    assert!(session.state().recording_bar.unwrap().recording);
}

#[test]
fn the_rest_of_the_script_is_read_only_while_recording() {
    let (_harness, mut session) = open_hello_world();
    session
        .edit(Edit::Correct {
            word: "w1".into(),
            text: "Hi,".into(),
        })
        .unwrap();
    let script = session.state().words;
    start_before(&mut session, "w2");

    let correct = Edit::Correct {
        word: "w3".into(),
        text: "there".into(),
    };
    assert!(matches!(
        session.edit(correct.clone()),
        Err(EditError::ReadOnlyWhileRecording)
    ));
    assert!(matches!(
        session.cut(&["w3".into()]),
        Err(EditError::ReadOnlyWhileRecording)
    ));
    assert!(matches!(
        session.paste(None, &[], "more"),
        Err(EditError::ReadOnlyWhileRecording)
    ));
    let nudge = Edit::Move {
        word: "w3".into(),
        by: 10,
    };
    assert!(matches!(
        session.nudge("n1", nudge.clone()),
        Err(EditError::ReadOnlyWhileRecording)
    ));
    assert!(matches!(
        session.drag("d1", nudge),
        Err(EditError::ReadOnlyWhileRecording)
    ));
    assert!(matches!(
        session.undo(),
        Err(EditError::ReadOnlyWhileRecording)
    ));
    assert_eq!(session.state().words, script);
    assert!(session.state().locked);

    session.stop_recording().unwrap();
    session.edit(correct).unwrap();
}

#[test]
fn the_live_model_is_fetched_before_the_first_recording() {
    let harness = Harness::new();
    harness.live.needs_download();
    let mut session = harness.create("Talk");
    session.open_recording_bar(InputChoice::default());
    let live_model = |session: &Session| session.state().recording_bar.unwrap().live_model;
    assert_eq!(live_model(&session), LiveModel::Fetching { percent: None });
    assert!(matches!(
        session.start_recording(InsertionPoint::default()),
        Err(CaptureError::LiveModelFetching)
    ));

    harness.live.model(LiveModel::Fetching {
        percent: Progress {
            downloaded: 25,
            total: Some(100),
        }
        .percent(),
    });
    session.poll().unwrap();
    assert_eq!(
        live_model(&session),
        LiveModel::Fetching { percent: Some(25) }
    );

    harness.live.model(LiveModel::Ready);
    session.poll().unwrap();
    assert_eq!(live_model(&session), LiveModel::Ready);
    session.start_recording(InsertionPoint::default()).unwrap();
}

#[test]
fn reopening_the_bar_mid_download_follows_the_same_download() {
    let harness = Harness::new();
    harness.live.needs_download();
    let mut session = harness.create("Talk");
    session.open_recording_bar(InputChoice::default());
    harness
        .live
        .model(LiveModel::Fetching { percent: Some(40) });
    session.poll().unwrap();
    session.close_recording_bar().unwrap();

    session.open_recording_bar(InputChoice::default());
    let live_model = |session: &Session| session.state().recording_bar.unwrap().live_model;
    assert_eq!(
        live_model(&session),
        LiveModel::Fetching { percent: Some(40) }
    );
    assert_eq!(harness.live.preparations(), 1);

    harness.live.model(LiveModel::Ready);
    session.poll().unwrap();
    assert_eq!(live_model(&session), LiveModel::Ready);
}

#[test]
fn a_live_model_that_cannot_be_fetched_does_not_stop_a_recording() {
    let harness = Harness::new();
    harness.live.needs_download();
    let mut session = harness.create("Talk");
    session.open_recording_bar(InputChoice::default());

    harness.live.model(LiveModel::Failed {
        reason: "offline".into(),
    });
    session.poll().unwrap();

    session.start_recording(InsertionPoint::default()).unwrap();
}
