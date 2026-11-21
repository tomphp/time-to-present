use ttp_core::capture::{Access, CaptureError, InputChoice};

use crate::support::{BUILT_IN, Harness, INTERFACE};

fn choose(device: Option<&str>, channel: u16) -> InputChoice {
    InputChoice {
        device: device.map(str::to_string),
        channel,
    }
}

#[test]
fn the_bar_opens_on_the_system_default_input_channel_1_by_default() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");

    session.open_recording_bar(InputChoice::default());

    let bar = session.state().recording_bar.unwrap();
    let input = bar.input.unwrap();
    assert_eq!(bar.access, Access::Granted);
    assert_eq!(input.device.name, BUILT_IN);
    assert_eq!(input.choice, choose(None, 1));
    assert_eq!(bar.notice, None);
    assert_eq!(harness.audio.opened().as_deref(), Some(BUILT_IN));
}

#[test]
fn the_bar_lists_every_input_for_the_picker() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");

    session.open_recording_bar(InputChoice::default());

    let names: Vec<String> = session
        .state()
        .recording_bar
        .unwrap()
        .inputs
        .into_iter()
        .map(|input| input.name)
        .collect();
    assert_eq!(names, [BUILT_IN, INTERFACE]);
}

#[test]
fn a_missing_device_falls_back_to_the_system_default_with_a_notice() {
    let harness = Harness::new();
    harness.audio.unplug(INTERFACE);
    let mut session = harness.create("Talk");

    session.open_recording_bar(choose(Some(INTERFACE), 1));

    let bar = session.state().recording_bar.unwrap();
    assert_eq!(bar.input.unwrap().choice, choose(None, 1));
    assert_eq!(
        bar.notice.as_deref(),
        Some("MOTU M2 is not connected, so the system default input is used.")
    );
    assert_eq!(harness.audio.opened().as_deref(), Some(BUILT_IN));
}

#[test]
fn a_channel_the_device_lacks_falls_back_to_channel_1_with_a_notice() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");

    session.open_recording_bar(choose(Some(INTERFACE), 3));

    let bar = session.state().recording_bar.unwrap();
    assert_eq!(bar.input.unwrap().choice, choose(Some(INTERFACE), 1));
    assert_eq!(
        bar.notice.as_deref(),
        Some("MOTU M2 has no channel 3, so channel 1 is used.")
    );
}

#[test]
fn choosing_another_input_reopens_the_bar_on_it_and_clears_the_notice() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    session.open_recording_bar(choose(Some(INTERFACE), 3));

    session.select_input(choose(Some(INTERFACE), 2)).unwrap();

    let bar = session.state().recording_bar.unwrap();
    assert_eq!(bar.input.unwrap().choice, choose(Some(INTERFACE), 2));
    assert_eq!(bar.notice, None);
    assert_eq!(harness.audio.opened().as_deref(), Some(INTERFACE));
}

#[test]
fn the_input_cannot_change_while_recording() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    session.open_recording_bar(InputChoice::default());
    session.start_recording().unwrap();

    let error = session
        .select_input(choose(Some(INTERFACE), 1))
        .unwrap_err();

    assert!(matches!(error, CaptureError::AlreadyRecording));
    assert_eq!(harness.audio.opened().as_deref(), Some(BUILT_IN));
}

#[test]
fn when_access_is_denied_the_bar_says_so_and_nothing_can_be_recorded() {
    let harness = Harness::new();
    harness.audio.deny_access();
    let mut session = harness.create("Talk");

    session.open_recording_bar(InputChoice::default());

    let bar = session.state().recording_bar.unwrap();
    assert_eq!(bar.access, Access::Denied);
    assert_eq!(bar.input, None);
    assert_eq!(harness.audio.opened(), None);
    assert!(matches!(
        session.start_recording().unwrap_err(),
        CaptureError::NoAccess
    ));
}

#[test]
fn closing_the_bar_closes_the_input() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    session.open_recording_bar(InputChoice::default());

    session.close_recording_bar().unwrap();

    assert_eq!(session.state().recording_bar, None);
    assert_eq!(harness.audio.opened(), None);
}

#[test]
fn the_bar_cannot_close_while_recording() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    session.open_recording_bar(InputChoice::default());
    session.start_recording().unwrap();

    assert!(matches!(
        session.close_recording_bar().unwrap_err(),
        CaptureError::AlreadyRecording
    ));
    assert!(session.state().recording_bar.unwrap().recording);
}

#[test]
fn a_failed_choice_leaves_no_input_open_and_no_stale_notice() {
    let harness = Harness::new();
    let mut session = harness.create("Talk");
    session.open_recording_bar(choose(Some(INTERFACE), 3));
    harness.audio.unplug(BUILT_IN);
    harness.audio.unplug(INTERFACE);

    let error = session.select_input(choose(None, 1)).unwrap_err();

    let bar = session.state().recording_bar.unwrap();
    assert!(matches!(error, CaptureError::NoInput));
    assert_eq!((bar.input, bar.notice), (None, None));
    assert_eq!(harness.audio.opened(), None);
}
