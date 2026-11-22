use std::fs;
use std::net::{IpAddr, Ipv4Addr};
use std::path::PathBuf;

use tempfile::TempDir;
use ttp_core::capture::InputChoice;
use ttp_core::perform::{PerformanceLayout, PerformanceSettings, PixelSize, PresentationSize};
use ttp_core::settings::{ApproachCue, Settings};

fn settings_in(dir: &TempDir) -> Settings {
    Settings::load(dir.path().join("settings.json"))
}

fn folder(dir: &TempDir, name: &str) -> PathBuf {
    let path = dir.path().join(name);
    fs::create_dir(&path).unwrap();
    path
}

#[test]
fn settings_start_empty_when_nothing_has_been_saved() {
    let dir = TempDir::new().unwrap();

    assert!(settings_in(&dir).recent().is_empty());
}

#[test]
fn the_recent_list_is_most_recent_first_without_duplicates_and_survives_a_reload() {
    let dir = TempDir::new().unwrap();
    let (a, b) = (folder(&dir, "a"), folder(&dir, "b"));
    let mut settings = settings_in(&dir);

    settings.add_recent(&a).unwrap();
    settings.add_recent(&b).unwrap();
    settings.add_recent(&a).unwrap();

    assert_eq!(settings.recent(), [a.clone(), b.clone()]);
    assert_eq!(settings_in(&dir).recent(), [a, b]);
}

#[test]
fn the_recent_list_keeps_only_the_latest_entries() {
    let dir = TempDir::new().unwrap();
    let mut settings = settings_in(&dir);
    let folders: Vec<_> = (0..12).map(|i| folder(&dir, &i.to_string())).collect();

    for f in &folders {
        settings.add_recent(f).unwrap();
    }

    assert_eq!(settings.recent().len(), 10);
    assert_eq!(settings.recent()[0], folders[11]);
}

#[test]
fn missing_folders_are_dropped_from_the_recent_list_and_reported() {
    let dir = TempDir::new().unwrap();
    let (kept, gone) = (folder(&dir, "kept"), folder(&dir, "gone"));
    let mut settings = settings_in(&dir);
    settings.add_recent(&gone).unwrap();
    settings.add_recent(&kept).unwrap();
    fs::remove_dir(&gone).unwrap();

    let dropped = settings.drop_missing().unwrap();

    assert_eq!(dropped, [gone]);
    assert_eq!(settings_in(&dir).recent(), [kept]);
}

#[test]
fn a_recent_entry_can_be_forgotten() {
    let dir = TempDir::new().unwrap();
    let a = folder(&dir, "a");
    let mut settings = settings_in(&dir);
    settings.add_recent(&a).unwrap();

    settings.forget_recent(&a).unwrap();

    assert!(settings_in(&dir).recent().is_empty());
}

#[test]
fn keys_this_version_does_not_know_are_kept_when_saving() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("settings.json"), r#"{"port": 4747}"#).unwrap();
    let a = folder(&dir, "a");

    settings_in(&dir).add_recent(&a).unwrap();

    let saved: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(dir.path().join("settings.json")).unwrap())
            .unwrap();
    assert_eq!(saved["port"], 4747);
}

#[test]
fn an_unreadable_settings_file_falls_back_to_defaults() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("settings.json"), "not json").unwrap();

    assert!(settings_in(&dir).recent().is_empty());
}

#[test]
fn the_input_defaults_to_the_system_default_on_channel_1() {
    let dir = TempDir::new().unwrap();

    assert_eq!(*settings_in(&dir).input(), InputChoice::default());
}

#[test]
fn the_chosen_input_is_remembered_on_this_machine() {
    let dir = TempDir::new().unwrap();
    let choice = InputChoice {
        device: Some("MOTU M2".into()),
        channel: 2,
    };

    settings_in(&dir).set_input(choice.clone()).unwrap();

    assert_eq!(*settings_in(&dir).input(), choice);
}

#[test]
fn the_server_defaults_to_port_4747_on_the_loopback_address() {
    let dir = TempDir::new().unwrap();

    let server = settings_in(&dir).server();

    assert_eq!(server.port, 4747);
    assert_eq!(server.address, IpAddr::from(Ipv4Addr::LOCALHOST));
}

#[test]
fn the_server_port_and_bind_address_come_from_this_machines_settings() {
    let dir = TempDir::new().unwrap();
    fs::write(
        dir.path().join("settings.json"),
        r#"{"port": 5000, "bindAddress": "0.0.0.0"}"#,
    )
    .unwrap();

    let server = settings_in(&dir).server();

    assert_eq!(server.port, 5000);
    assert_eq!(server.address, IpAddr::from(Ipv4Addr::UNSPECIFIED));
}

#[test]
fn the_approach_cue_defaults_to_on_with_a_long_gap_of_one_and_a_half_seconds() {
    let dir = TempDir::new().unwrap();

    assert_eq!(
        settings_in(&dir).approach_cue(),
        ApproachCue {
            enabled: true,
            long_gap: 1500
        }
    );
}

#[test]
fn the_approach_cue_switch_and_long_gap_threshold_are_remembered_on_this_machine() {
    let dir = TempDir::new().unwrap();
    let cue = ApproachCue {
        enabled: false,
        long_gap: 2500,
    };

    settings_in(&dir).set_approach_cue(cue).unwrap();

    assert_eq!(settings_in(&dir).approach_cue(), cue);
    let saved: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(dir.path().join("settings.json")).unwrap())
            .unwrap();
    assert_eq!(
        saved["approachCue"],
        serde_json::json!({"enabled": false, "longGap": 2500})
    );
}

#[test]
fn performing_defaults_to_two_windows_on_displays_chosen_for_them() {
    let dir = TempDir::new().unwrap();

    let performance = settings_in(&dir).performance().clone();

    assert_eq!(performance.layout, PerformanceLayout::TwoWindows);
    assert_eq!(performance.teleprompter_display, None);
    assert_eq!(performance.presentation_display, None);
    assert_eq!(performance.presentation_size, PresentationSize::default());
}

#[test]
fn the_performance_layout_displays_and_size_are_remembered_on_this_machine() {
    let dir = TempDir::new().unwrap();
    let chosen = PerformanceSettings {
        layout: PerformanceLayout::TeleprompterOnly,
        teleprompter_display: Some("Built-in Retina Display".into()),
        presentation_display: Some("Projector".into()),
        presentation_size: PresentationSize::FillDisplay,
    };

    settings_in(&dir).set_performance(chosen.clone()).unwrap();

    assert_eq!(*settings_in(&dir).performance(), chosen);
}

#[test]
fn the_combined_layout_is_remembered_on_this_machine() {
    let dir = TempDir::new().unwrap();
    let chosen = PerformanceSettings {
        layout: PerformanceLayout::Combined,
        ..PerformanceSettings::default()
    };

    settings_in(&dir).set_performance(chosen.clone()).unwrap();

    assert_eq!(*settings_in(&dir).performance(), chosen);
    let stored = std::fs::read_to_string(dir.path().join("settings.json")).unwrap();
    assert!(stored.contains("\"combined\""), "{stored}");
}

#[test]
fn a_vertical_presentation_size_is_remembered_on_this_machine() {
    let dir = TempDir::new().unwrap();
    let vertical = PresentationSize::Pixels(PixelSize::new(1080, 1920).unwrap());
    let chosen = PerformanceSettings {
        presentation_size: vertical,
        ..PerformanceSettings::default()
    };

    settings_in(&dir).set_performance(chosen).unwrap();

    assert_eq!(settings_in(&dir).performance().presentation_size, vertical);
}

#[test]
fn a_size_saved_by_an_older_version_falls_back_to_1920_by_1080() {
    for old in ["1280x720", "1920x1080", "fit"] {
        let dir = TempDir::new().unwrap();
        let a = folder(&dir, "a");
        let saved = serde_json::json!({
            "recent": [a],
            "performance": {"layout": "combined", "presentationSize": old},
        });
        fs::write(dir.path().join("settings.json"), saved.to_string()).unwrap();

        let settings = settings_in(&dir);

        assert_eq!(settings.recent(), [a]);
        assert_eq!(settings.performance().layout, PerformanceLayout::Combined);
        assert_eq!(
            settings.performance().presentation_size,
            PresentationSize::default()
        );
    }
}
