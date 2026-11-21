use std::sync::{Arc, Mutex};

use ttp_core::capture::InputChoice;
use ttp_core::session::Session;

use crate::support::{Harness, INTERFACE};

fn feed(session: &Session) -> Arc<Mutex<Vec<f32>>> {
    let fed = Arc::new(Mutex::new(Vec::new()));
    let sink = fed.clone();
    session.subscribe_feed(move |samples| sink.lock().unwrap().extend_from_slice(samples));
    fed
}

/// A 48 kHz ramp, so every third sample is the value the 16 kHz feed should carry.
fn ramp(frames: usize) -> Vec<f32> {
    (0..frames).map(|i| i as f32 / 1_000.0).collect()
}

#[test]
fn while_recording_the_chosen_channel_is_fed_at_16_khz() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    let fed = feed(&session);
    session.open_recording_bar(InputChoice::default());
    session.start_recording().unwrap();

    let audio = ramp(12);
    harness.audio.play(&audio[..5]);
    harness.audio.play(&audio[5..]);

    assert_eq!(*fed.lock().unwrap(), [0.0, 0.003, 0.006, 0.009]);
}

#[test]
fn nothing_is_fed_unless_recording() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    let fed = feed(&session);
    session.open_recording_bar(InputChoice::default());

    harness.audio.play(&ramp(480));
    session.start_recording().unwrap();
    session.stop_recording().unwrap();
    harness.audio.play(&ramp(480));

    assert!(fed.lock().unwrap().is_empty());
}

fn fed_from_interface(chunks: &[&[f32]]) -> Vec<f32> {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    let fed = feed(&session);
    session.open_recording_bar(InputChoice {
        device: Some(INTERFACE.into()),
        channel: 1,
    });
    session.start_recording().unwrap();
    for chunk in chunks {
        harness.audio.play(chunk);
    }
    fed.lock().unwrap().clone()
}

#[test]
fn a_44_1_khz_input_feeds_the_same_16_khz_signal_however_its_audio_is_chunked() {
    let stereo: Vec<f32> = (0..44_100)
        .flat_map(|i| [(i as f32 / 100.0).sin(), 0.0])
        .collect();

    let whole = fed_from_interface(&[&stereo]);
    let chunked = fed_from_interface(&stereo.chunks(2 * 441).collect::<Vec<_>>());

    assert_eq!(whole.len(), 16_000);
    assert_eq!(whole, chunked);
}
