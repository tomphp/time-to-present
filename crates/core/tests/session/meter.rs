use std::sync::{Arc, Mutex};

use ttp_core::capture::{InputChoice, Meter};
use ttp_core::session::Session;

use crate::support::Harness;

/// 50 ms of the built-in input at 48 kHz.
const METER_FRAMES: usize = 2_400;

fn meters(session: &Session) -> Arc<Mutex<Vec<Meter>>> {
    let meters = Arc::new(Mutex::new(Vec::new()));
    let sink = meters.clone();
    session.subscribe_meter(move |meter| sink.lock().unwrap().push(meter));
    meters
}

fn quiet_with_peak(peak: f32) -> Vec<f32> {
    let mut frames = vec![0.01; METER_FRAMES];
    frames[METER_FRAMES / 2] = -peak;
    frames
}

#[test]
fn the_meter_reports_the_peak_of_every_50_ms_while_the_bar_is_open() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    let meters = meters(&session);
    session.open_recording_bar(InputChoice::default());

    harness.audio.play(&quiet_with_peak(0.5));
    harness.audio.play(&quiet_with_peak(0.25));

    let expected = |peak| Meter {
        peak,
        clipped: false,
        recorded: None,
    };
    assert_eq!(*meters.lock().unwrap(), [expected(0.5), expected(0.25)]);
}

#[test]
fn the_meter_flags_a_clip_only_for_the_50_ms_it_happened_in() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    let meters = meters(&session);
    session.open_recording_bar(InputChoice::default());

    harness.audio.play(&quiet_with_peak(1.0));
    harness.audio.play(&quiet_with_peak(0.9));

    let clipped: Vec<bool> = meters.lock().unwrap().iter().map(|m| m.clipped).collect();
    assert_eq!(clipped, [true, false]);
}

#[test]
fn while_recording_the_meter_carries_the_elapsed_recording_time() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    let meters = meters(&session);
    session.open_recording_bar(InputChoice::default());
    session.start_recording().unwrap();

    harness.audio.play(&[0.1; METER_FRAMES * 3]);

    let recorded: Vec<_> = meters.lock().unwrap().iter().map(|m| m.recorded).collect();
    assert_eq!(recorded, [Some(50), Some(100), Some(150)]);
}
