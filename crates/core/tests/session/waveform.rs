use ttp_core::capture::InputChoice;
use ttp_core::session::InsertionPoint;
use ttp_core::waveform::{self, BUCKET};

use crate::support::Harness;

/// The built-in input runs at 48 kHz, so 480 samples fill one bucket.
const BUCKET_SAMPLES: usize = 480;

#[test]
fn a_recordings_waveform_is_its_peak_level_in_every_bucket_of_recording_time() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    session.open_recording_bar(InputChoice::default());
    session.start_recording(InsertionPoint::default()).unwrap();
    harness.audio.play(&[0.5; BUCKET_SAMPLES]);
    harness.audio.play(&[0.1, -0.25].repeat(BUCKET_SAMPLES / 2));
    harness.audio.play(&[-1.0; 10]);
    let recording = session.stop_recording().unwrap();

    let file = session.recording_file(&recording.id).unwrap();
    let waveform = waveform::read(&file).unwrap();

    assert_eq!(BUCKET, 10);
    assert_eq!(waveform.peaks, [0.5, 0.25, 1.0]);
}

#[test]
fn an_unknown_recording_has_no_file() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let session = harness.open(&folder);

    assert_eq!(session.recording_file("r9"), None);
    assert_eq!(
        session.recording_file("r1"),
        Some(folder.join("recordings/r1.wav"))
    );
}
