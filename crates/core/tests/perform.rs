use ttp_core::perform::{
    Display, KeyTarget, PageKey, PageKeyAction, PerformanceWindow, PresentationSize, classify,
    display_for,
};

fn press(key: &str) -> PageKey {
    PageKey {
        key: key.into(),
        target: on("BODY"),
        ..PageKey::default()
    }
}

fn on(tag: &str) -> KeyTarget {
    KeyTarget {
        tag: tag.into(),
        ..KeyTarget::default()
    }
}

fn input(kind: &str) -> KeyTarget {
    KeyTarget {
        input_type: Some(kind.into()),
        ..on("INPUT")
    }
}

fn control_command(key: &str) -> PageKey {
    PageKey {
        meta: true,
        ctrl: true,
        ..press(key)
    }
}

fn forwards(key: &PageKey) -> bool {
    classify(key) == PageKeyAction::Forward
}

#[test]
fn performance_keys_pressed_on_the_page_are_forwarded() {
    for key in [" ", "PageDown", "ArrowLeft", "Home", "b"] {
        assert!(forwards(&press(key)), "{key:?} should be forwarded");
    }
}

#[test]
fn escape_leaves_fullscreen() {
    let held = PageKey {
        repeat: true,
        ..press("Escape")
    };

    assert_eq!(classify(&press("Escape")), PageKeyAction::LeaveFullscreen);
    assert_eq!(classify(&held), PageKeyAction::LeaveFullscreen);
}

#[test]
fn control_command_f_toggles_fullscreen() {
    for key in ["f", "F"] {
        assert_eq!(
            classify(&control_command(key)),
            PageKeyAction::ToggleFullscreen,
            "{key:?}"
        );
    }
}

#[test]
fn control_command_f_toggles_fullscreen_even_in_a_text_input() {
    let in_a_field = PageKey {
        target: input("text"),
        ..control_command("f")
    };

    assert_eq!(classify(&in_a_field), PageKeyAction::ToggleFullscreen);
}

#[test]
fn holding_control_command_f_toggles_only_once() {
    let held = PageKey {
        repeat: true,
        ..control_command("f")
    };

    assert_eq!(classify(&held), PageKeyAction::StayWithPage);
}

#[test]
fn command_combinations_stay_with_the_page() {
    let copy = PageKey {
        meta: true,
        ..press("c")
    };
    let find = PageKey {
        meta: true,
        ..press("f")
    };
    let shifted = PageKey {
        shift: true,
        ..control_command("F")
    };
    let optioned = PageKey {
        alt: true,
        ..control_command("f")
    };

    for key in [copy, find, shifted, optioned] {
        assert_eq!(classify(&key), PageKeyAction::StayWithPage, "{key:?}");
    }
}

#[test]
fn keys_typed_into_a_focused_text_input_stay_with_the_page() {
    let targets = [
        input("text"),
        input("search"),
        input("email"),
        input("number"),
        on("TEXTAREA"),
        on("SELECT"),
        KeyTarget {
            editable: true,
            ..on("DIV")
        },
    ];

    for target in targets {
        let typed = PageKey {
            target: target.clone(),
            ..press("b")
        };
        assert!(!forwards(&typed), "{target:?} should keep the key");
    }
}

#[test]
fn keys_on_inputs_that_take_no_text_are_forwarded() {
    for kind in ["checkbox", "radio", "button", "range", "submit"] {
        let pressed = PageKey {
            target: input(kind),
            ..press("ArrowRight")
        };
        assert!(forwards(&pressed), "{kind:?} input should forward the key");
    }
    let on_a_button = PageKey {
        target: on("BUTTON"),
        ..press(" ")
    };
    assert!(forwards(&on_a_button));
}

#[test]
fn an_input_without_a_type_takes_text() {
    let typed = PageKey {
        target: on("input"),
        ..press("b")
    };

    assert!(!forwards(&typed));
}

#[test]
fn keys_composing_text_stay_with_the_page() {
    for key in [press("ArrowRight"), press("Escape"), control_command("f")] {
        let composing = PageKey {
            composing: true,
            ..key
        };
        assert_eq!(classify(&composing), PageKeyAction::StayWithPage);
    }
}

#[test]
fn escape_typed_into_a_focused_text_input_stays_with_the_page() {
    let in_a_field = PageKey {
        target: input("text"),
        ..press("Escape")
    };

    assert_eq!(classify(&in_a_field), PageKeyAction::StayWithPage);
}

fn displays() -> Vec<Display> {
    vec![
        Display {
            name: "Studio Display".into(),
            primary: false,
        },
        Display {
            name: "Built-in Retina Display".into(),
            primary: true,
        },
        Display {
            name: "Projector".into(),
            primary: false,
        },
    ]
}

#[test]
fn each_window_goes_on_its_remembered_display() {
    let teleprompter = display_for(
        PerformanceWindow::Teleprompter,
        Some("Projector"),
        &displays(),
    );

    assert_eq!(teleprompter, Some(2));
}

#[test]
fn with_nothing_remembered_the_teleprompter_takes_the_main_display() {
    assert_eq!(
        display_for(PerformanceWindow::Teleprompter, None, &displays()),
        Some(1)
    );
}

#[test]
fn with_nothing_remembered_the_presentation_takes_another_display() {
    assert_eq!(
        display_for(PerformanceWindow::Presentation, None, &displays()),
        Some(0)
    );
}

#[test]
fn a_remembered_display_that_is_gone_falls_back_to_the_default() {
    let presentation = display_for(PerformanceWindow::Presentation, Some("Old TV"), &displays());

    assert_eq!(presentation, Some(0));
}

#[test]
fn with_one_display_both_windows_share_it() {
    let only = vec![Display {
        name: "Built-in Retina Display".into(),
        primary: true,
    }];

    assert_eq!(
        display_for(PerformanceWindow::Teleprompter, None, &only),
        Some(0)
    );
    assert_eq!(
        display_for(PerformanceWindow::Presentation, None, &only),
        Some(0)
    );
}

#[test]
fn there_is_no_display_to_choose_when_none_are_connected() {
    assert_eq!(
        display_for(PerformanceWindow::Teleprompter, None, &[]),
        None
    );
}

#[test]
fn a_size_preset_gives_the_presentation_window_that_size() {
    let display = (2560.0, 1440.0);

    assert_eq!(PresentationSize::Hd720.within(display), (1280.0, 720.0));
    assert_eq!(PresentationSize::Hd1080.within(display), (1920.0, 1080.0));
}

#[test]
fn fit_fills_the_display_at_16_by_9() {
    assert_eq!(
        PresentationSize::Fit.within((1440.0, 900.0)),
        (1440.0, 810.0)
    );
    assert_eq!(
        PresentationSize::Fit.within((1920.0, 1200.0)),
        (1920.0, 1080.0)
    );
    assert_eq!(
        PresentationSize::Fit.within((1000.0, 500.0)),
        (888.0, 500.0)
    );
}

#[test]
fn a_preset_larger_than_the_display_shrinks_to_fit() {
    assert_eq!(
        PresentationSize::Hd1080.within((1440.0, 900.0)),
        (1440.0, 810.0)
    );
}
