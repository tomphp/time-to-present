use std::fs;

use hound::{SampleFormat, WavReader, WavSpec};
use serde_json::{Value, json};
use ttp_core::capture::InputChoice;
use ttp_core::store::Recording;

use crate::support::{Harness, INTERFACE};

/// Stereo frames whose second channel is distinct from the first at every frame.
const STEREO: [f32; 6] = [0.5, -0.25, 0.0, 1.0, -1.0, 0.25];

fn interface_channel(channel: u16) -> InputChoice {
    InputChoice {
        device: Some(INTERFACE.into()),
        channel,
    }
}

#[test]
fn a_stopped_recording_is_a_24_bit_mono_wav_of_the_chosen_channel_at_the_native_rate() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    session.open_recording_bar(interface_channel(2));

    session.start_recording().unwrap();
    harness.audio.play(&STEREO);
    let recording = session.stop_recording().unwrap();

    let mut wav = WavReader::open(session.state().folder.join(&recording.file)).unwrap();
    assert_eq!(
        wav.spec(),
        WavSpec {
            channels: 1,
            sample_rate: 44_100,
            bits_per_sample: 24,
            sample_format: SampleFormat::Int,
        }
    );
    let samples: Vec<i32> = wav.samples().map(Result::unwrap).collect();
    assert_eq!(samples, [-2_097_152, 8_388_607, 2_097_152]);
}

#[test]
fn stop_fixes_up_the_wav_header_to_the_length_recorded() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    session.open_recording_bar(interface_channel(1));

    session.start_recording().unwrap();
    harness.audio.play(&STEREO);
    harness.audio.play(&STEREO);
    let recording = session.stop_recording().unwrap();

    let bytes = fs::read(session.state().folder.join(&recording.file)).unwrap();
    let riff_size = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
    assert_eq!(riff_size, bytes.len() - 8);
    let data = bytes.windows(4).position(|chunk| chunk == b"data").unwrap();
    let data_size = u32::from_le_bytes(bytes[data + 4..data + 8].try_into().unwrap());
    assert_eq!(data_size, 6 * 3);
}

#[test]
fn a_stopped_recording_is_registered_in_presentation_json_and_the_script_is_untouched() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let before = session.state().words;
    session.open_recording_bar(InputChoice::default());

    session.start_recording().unwrap();
    harness.audio.play(&[0.1; 480]);
    let recording = session.stop_recording().unwrap();

    assert_eq!(
        recording,
        Recording {
            id: "r2".into(),
            file: "recordings/r2.wav".into()
        }
    );
    assert!(folder.join("recordings/r2.wav").is_file());
    let json: Value =
        serde_json::from_str(&fs::read_to_string(folder.join("presentation.json")).unwrap())
            .unwrap();
    assert_eq!(
        json["recordings"],
        json!([
            {"id": "r1", "file": "recordings/r1.wav"},
            {"id": "r2", "file": "recordings/r2.wav"}
        ])
    );
    assert_eq!(harness.open(&folder).state().words, before);
}

#[test]
fn a_cancelled_recording_leaves_no_trace() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    let folder = session.state().folder;
    let saved = fs::read_to_string(folder.join("presentation.json")).unwrap();
    session.open_recording_bar(InputChoice::default());

    session.start_recording().unwrap();
    harness.audio.play(&[0.1; 480]);
    session.cancel_recording().unwrap();

    assert_eq!(fs::read_dir(folder.join("recordings")).unwrap().count(), 0);
    assert_eq!(
        fs::read_to_string(folder.join("presentation.json")).unwrap(),
        saved
    );
    assert!(!session.state().recording_bar.unwrap().recording);
}

#[test]
fn a_new_recording_never_takes_the_name_of_a_wav_already_in_recordings() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    let folder = session.state().folder;
    fs::write(folder.join("recordings/r1.wav"), "interrupted take").unwrap();
    session.open_recording_bar(InputChoice::default());

    session.start_recording().unwrap();
    let recording = session.stop_recording().unwrap();

    assert_eq!(recording.id, "r2");
    assert_eq!(
        fs::read_to_string(folder.join("recordings/r1.wav")).unwrap(),
        "interrupted take"
    );
}

#[test]
fn app_nap_is_held_off_only_while_recording() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    session.open_recording_bar(InputChoice::default());
    assert!(!harness.app_nap.held());

    session.start_recording().unwrap();
    assert!(harness.app_nap.held());
    session.stop_recording().unwrap();
    assert!(!harness.app_nap.held());

    session.start_recording().unwrap();
    session.cancel_recording().unwrap();
    assert!(!harness.app_nap.held());
}
