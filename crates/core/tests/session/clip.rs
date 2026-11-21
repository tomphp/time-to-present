use std::io::Cursor;

use hound::{SampleFormat, WavReader, WavSpec};
use ttp_core::capture::InputChoice;
use ttp_core::clip;
use ttp_core::session::InsertionPoint;

use crate::support::Harness;

/// The built-in input runs at 48 kHz.
const SAMPLES_PER_MS: usize = 48;

/// A second at half level, then a second at a quarter, below zero.
fn two_second_recording(harness: &Harness) -> std::path::PathBuf {
    let mut session = harness.create("Talk");
    session.open_recording_bar(InputChoice::default());
    session.start_recording(InsertionPoint::default()).unwrap();
    harness.audio.play(&[0.5; 1_000 * SAMPLES_PER_MS]);
    harness.audio.play(&[-0.25; 1_000 * SAMPLES_PER_MS]);
    let recording = session.stop_recording().unwrap();
    session.recording_file(&recording.id).unwrap()
}

fn levels(wav: Vec<u8>) -> (WavSpec, Vec<f32>) {
    let mut reader = WavReader::new(Cursor::new(wav)).unwrap();
    let spec = reader.spec();
    let full_scale = (1i32 << (spec.bits_per_sample - 1)) as f32;
    let samples = reader
        .samples::<i32>()
        .map(|sample| sample.unwrap() as f32 / full_scale);
    (spec, samples.collect())
}

#[test]
fn a_clip_is_the_recordings_audio_between_two_recording_times_in_its_own_format() {
    let harness = Harness::new();
    let file = two_second_recording(&harness);

    let (spec, samples) = levels(clip::read(&file, 900, 1_100).unwrap());

    assert_eq!(
        spec,
        WavSpec {
            channels: 1,
            sample_rate: 48_000,
            bits_per_sample: 24,
            sample_format: SampleFormat::Int,
        }
    );
    assert_eq!(samples.len(), 200 * SAMPLES_PER_MS);
    let (before, after) = samples.split_at(100 * SAMPLES_PER_MS);
    assert!(before.iter().all(|level| (level - 0.5).abs() < 1e-3));
    assert!(after.iter().all(|level| (level + 0.25).abs() < 1e-3));
}

#[test]
fn a_clip_reaching_past_either_end_of_the_recording_stops_at_it() {
    let harness = Harness::new();
    let file = two_second_recording(&harness);

    let (_, samples) = levels(clip::read(&file, -1_000, 5_000).unwrap());

    assert_eq!(samples.len(), 2_000 * SAMPLES_PER_MS);
}

#[test]
fn a_clip_that_ends_before_it_starts_is_empty() {
    let harness = Harness::new();
    let file = two_second_recording(&harness);

    let (_, samples) = levels(clip::read(&file, 1_500, 1_200).unwrap());

    assert!(samples.is_empty());
}
