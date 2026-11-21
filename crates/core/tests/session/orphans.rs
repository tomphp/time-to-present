use std::path::Path;

use ttp_core::capture::InputChoice;
use ttp_core::script::Edit;
use ttp_core::session::{InsertionPoint, PendingPassage, PendingStatus, Session};

use crate::support::{Harness, starts};

fn write_wav(path: &Path, samples: usize, finalized: bool) {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16_000,
        bits_per_sample: 24,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec).unwrap();
    (0..samples).for_each(|_| writer.write_sample(1000).unwrap());
    writer.finalize().unwrap();
    if !finalized {
        let mut bytes = std::fs::read(path).unwrap();
        bytes[4..8].fill(0);
        bytes[40..44].fill(0);
        std::fs::write(path, bytes).unwrap();
    }
}

fn wav_samples(path: &Path) -> u32 {
    hound::WavReader::open(path).unwrap().len()
}

fn crash_left(harness: &Harness, folder: &Path) -> Session {
    write_wav(&folder.join("recordings/r2.wav"), 160, false);
    harness.open(folder)
}

fn interrupted(id: &str) -> PendingPassage {
    PendingPassage {
        recording_id: id.into(),
        after: Some("w3".into()),
        before: None,
        status: PendingStatus::Interrupted,
    }
}

#[test]
fn a_wav_a_crash_left_with_an_unfixed_header_is_offered_at_the_end_and_registered() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    std::fs::create_dir_all(folder.join("recordings")).unwrap();

    let session = crash_left(&harness, &folder);

    assert_eq!(session.state().pending_passages, [interrupted("r2")]);
    assert_eq!(wav_samples(&folder.join("recordings/r2.wav")), 160);
    let saved = std::fs::read_to_string(folder.join("presentation.json")).unwrap();
    assert!(saved.contains("recordings/r2.wav"), "{saved}");
    assert!(harness.transcriber.jobs().is_empty());
}

#[test]
fn a_file_that_is_no_wav_is_still_offered_and_does_not_stop_the_presentation_opening() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    std::fs::create_dir_all(folder.join("recordings")).unwrap();
    std::fs::write(folder.join("recordings/r2.wav"), b"").unwrap();

    let mut session = harness.open(&folder);

    assert_eq!(session.state().pending_passages, [interrupted("r2")]);
    session.discard_transcription("r2").unwrap();
    assert!(!folder.join("recordings/r2.wav").exists());
}

#[test]
fn a_stopped_recording_without_words_is_offered_when_the_presentation_opens_again() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.open_recording_bar(InputChoice::default());
    session.start_recording(InsertionPoint::default()).unwrap();
    harness.audio.play(&[0.1; 480]);
    session.stop_recording().unwrap();
    drop(session);

    let reopened = harness.open(&folder);

    assert_eq!(reopened.state().pending_passages, [interrupted("r2")]);
}

#[test]
fn recordings_the_words_reference_are_not_offered() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    std::fs::create_dir_all(folder.join("recordings")).unwrap();
    write_wav(&folder.join("recordings/r1.wav"), 160, true);

    assert!(harness.open(&folder).state().pending_passages.is_empty());
}

#[test]
fn transcribe_queues_the_offered_recording_and_lands_its_words_at_the_end() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    std::fs::create_dir_all(folder.join("recordings")).unwrap();
    let mut session = crash_left(&harness, &folder);

    session.retry_transcription("r2").unwrap();
    assert_eq!(harness.transcriber.audio_files(), ["r2.wav"]);
    harness.transcriber.hear(&[("again", 100, 400)]);
    session.poll().unwrap();

    let state = session.state();
    assert!(state.pending_passages.is_empty());
    assert_eq!(starts(&state).last().unwrap().0, "again");
}

#[test]
fn discard_removes_the_offered_wav_and_its_registration() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    std::fs::create_dir_all(folder.join("recordings")).unwrap();
    let mut session = crash_left(&harness, &folder);

    session.discard_transcription("r2").unwrap();

    assert!(session.state().pending_passages.is_empty());
    assert!(!folder.join("recordings/r2.wav").exists());
    let saved = std::fs::read_to_string(folder.join("presentation.json")).unwrap();
    assert!(!saved.contains("r2"), "{saved}");
}

#[test]
fn removing_unused_recordings_deletes_the_offered_ones_and_keeps_the_referenced() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    std::fs::create_dir_all(folder.join("recordings")).unwrap();
    write_wav(&folder.join("recordings/r1.wav"), 160, true);
    let mut session = crash_left(&harness, &folder);

    session.remove_unused_recordings().unwrap();

    assert!(session.state().pending_passages.is_empty());
    assert!(!folder.join("recordings/r2.wav").exists());
    assert!(folder.join("recordings/r1.wav").exists());
    let saved = std::fs::read_to_string(folder.join("presentation.json")).unwrap();
    assert!(saved.contains("r1") && !saved.contains("r2"), "{saved}");
}

#[test]
fn removing_unused_recordings_keeps_one_an_undo_could_restore() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    std::fs::create_dir_all(folder.join("recordings")).unwrap();
    let mut session = crash_left(&harness, &folder);
    session.retry_transcription("r2").unwrap();
    harness.transcriber.hear(&[("again", 100, 400)]);
    session.poll().unwrap();
    let landed = session.state().words.last().unwrap().word.id.clone();
    let words = vec![landed];
    session.edit(Edit::Delete { words }).unwrap();

    session.remove_unused_recordings().unwrap();

    assert!(folder.join("recordings/r2.wav").exists());
    session.undo().unwrap();
    assert_eq!(starts(&session.state()).last().unwrap().0, "again");
}

#[test]
fn removing_unused_recordings_leaves_a_recording_still_being_transcribed() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.open_recording_bar(InputChoice::default());
    session.start_recording(InsertionPoint::default()).unwrap();
    harness.audio.play(&[0.1; 480]);
    session.stop_recording().unwrap();

    session.remove_unused_recordings().unwrap();

    assert!(folder.join("recordings/r2.wav").exists());
    assert_eq!(session.state().pending_passages.len(), 1);
}
