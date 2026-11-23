use std::panic::Location;

use ttp_core::diagnostics::{
    PerformStep, command_failed, display_chosen, fullscreen_switched, panicked, step_failed,
    step_started,
};
use ttp_core::perform::PerformanceWindow::{Presentation, Teleprompter};

#[test]
fn a_command_failure_reports_its_error() {
    assert_eq!(
        command_failed("no Presentation is open"),
        "a command failed: no Presentation is open"
    );
}

#[test]
fn a_panic_with_a_static_message_reports_it_and_where_it_happened() {
    let location = Location::caller();
    assert_eq!(
        panicked(&"index out of bounds", Some(location)),
        format!(
            "panicked at {}:{}:{}: index out of bounds",
            location.file(),
            location.line(),
            location.column()
        )
    );
}

#[test]
fn a_panic_with_a_formatted_message_reports_it() {
    assert_eq!(
        panicked(&String::from("lock poisoned by 3"), None),
        "panicked: lock poisoned by 3"
    );
}

#[test]
fn a_panic_with_another_payload_still_leaves_an_entry() {
    assert_eq!(panicked(&42, None), "panicked: (no message)");
}

#[test]
fn each_perform_step_says_what_it_is_doing() {
    let steps = [
        (
            PerformStep::BringUpWindow(Teleprompter),
            "bringing up the Teleprompter Window",
        ),
        (
            PerformStep::ChooseDisplay(Presentation),
            "choosing the Presentation Window's display",
        ),
        (
            PerformStep::EnterFullscreen(Teleprompter),
            "entering fullscreen on the Teleprompter Window",
        ),
        (
            PerformStep::LeaveFullscreen(Presentation),
            "leaving fullscreen on the Presentation Window",
        ),
        (
            PerformStep::PlaceWindow(Presentation),
            "placing the Presentation Window",
        ),
        (
            PerformStep::Focus(Teleprompter),
            "focusing the Teleprompter Window",
        ),
        (
            PerformStep::ShowWindow(Presentation),
            "showing the Presentation Window",
        ),
        (
            PerformStep::CloseWindow(Presentation),
            "closing the Presentation Window",
        ),
    ];
    for (step, expected) in steps {
        assert_eq!(step.to_string(), expected);
    }
}

#[test]
fn a_started_step_is_logged_as_part_of_perform() {
    assert_eq!(
        step_started(PerformStep::BringUpWindow(Teleprompter)),
        "Perform: bringing up the Teleprompter Window"
    );
}

#[test]
fn a_failed_step_names_the_step_and_the_error() {
    assert_eq!(
        step_failed(PerformStep::EnterFullscreen(Presentation), "window is gone"),
        "Perform failed while entering fullscreen on the Presentation Window: window is gone"
    );
}

#[test]
fn the_chosen_display_is_named() {
    assert_eq!(
        display_chosen(Teleprompter, Some("Built-in Retina Display")),
        "Perform: the Teleprompter Window goes on Built-in Retina Display"
    );
}

#[test]
fn no_connected_display_is_reported() {
    assert_eq!(
        display_chosen(Presentation, None),
        "Perform: no display is connected for the Presentation Window"
    );
}

#[test]
fn switching_fullscreen_names_the_window_and_where_it_went() {
    assert_eq!(
        fullscreen_switched("presentation", true),
        "the presentation window goes fullscreen"
    );
    assert_eq!(
        fullscreen_switched("teleprompter", false),
        "the teleprompter window goes windowed"
    );
}
