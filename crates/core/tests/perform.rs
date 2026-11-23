use ttp_core::perform::{
    Display, DisplayArea, KeyTarget, PageKey, PageKeyAction, PerformanceWindow, PixelSize,
    PresentationSize, SIZE_PRESETS, Shape, classify, display_for, fit,
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
fn f11_toggles_fullscreen_once_per_press_and_only_unmodified() {
    let held = PageKey {
        repeat: true,
        ..press("F11")
    };
    let shifted = PageKey {
        shift: true,
        ..press("F11")
    };

    assert_eq!(classify(&press("F11")), PageKeyAction::ToggleFullscreen);
    assert_eq!(classify(&held), PageKeyAction::StayWithPage);
    assert_ne!(classify(&shifted), PageKeyAction::ToggleFullscreen);
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

fn pixels(width: u32, height: u32) -> PresentationSize {
    PresentationSize::Pixels(PixelSize::new(width, height).unwrap())
}

fn display(width: f64, height: f64, scale: f64) -> DisplayArea {
    DisplayArea {
        width,
        height,
        scale,
    }
}

#[test]
fn a_pixel_size_opens_at_that_many_pixels_of_content() {
    let at_1x = fit(pixels(1920, 1080), display(2560.0, 1440.0, 1.0));
    let at_2x = fit(pixels(1920, 1080), display(2560.0, 1440.0, 2.0));

    assert_eq!(at_1x.points, (1920.0, 1080.0));
    assert_eq!(at_2x.points, (960.0, 540.0));
    assert_eq!(at_2x.pixels, (1920, 1080));
}

#[test]
fn a_vertical_preset_fits_a_retina_display_at_half_its_pixels() {
    let window = fit(pixels(1080, 1920), display(1512.0, 982.0, 2.0));

    assert_eq!(window.points, (540.0, 960.0));
    assert_eq!(window.pixels, (1080, 1920));
    assert!(!window.shrank);
}

#[test]
fn a_size_too_big_for_the_display_shrinks_to_the_largest_window_of_its_shape() {
    let window = fit(pixels(2160, 3840), display(1512.0, 982.0, 2.0));

    assert_eq!(window.points, (552.0, 982.0));
    assert_eq!(window.pixels, (1104, 1964));
    assert!(window.shrank);
}

#[test]
fn a_size_too_wide_for_the_display_shrinks_to_its_width() {
    let window = fit(pixels(3840, 2160), display(1440.0, 900.0, 1.0));

    assert_eq!(window.points, (1440.0, 810.0));
    assert_eq!(window.pixels, (1440, 810));
    assert!(window.shrank);
}

#[test]
fn a_size_that_exactly_fills_the_display_is_not_shrunk() {
    let window = fit(pixels(2880, 1800), display(1440.0, 900.0, 2.0));

    assert_eq!(window.points, (1440.0, 900.0));
    assert!(!window.shrank);
}

#[test]
fn fill_display_is_the_largest_16_by_9_window_that_fits() {
    let fill = |width, height| fit(PresentationSize::FillDisplay, display(width, height, 2.0));

    assert_eq!(fill(1440.0, 900.0).points, (1440.0, 810.0));
    assert_eq!(fill(1920.0, 1200.0).points, (1920.0, 1080.0));
    assert_eq!(fill(1000.0, 500.0).points, (888.0, 500.0));
    assert_eq!(fill(1440.0, 900.0).pixels, (2880, 1620));
    assert!(!fill(1440.0, 900.0).shrank);
}

#[test]
fn only_fill_display_goes_fullscreen_on_a_display_of_its_own() {
    let retina = display(1512.0, 982.0, 2.0);

    assert!(fit(PresentationSize::FillDisplay, retina).fullscreen_on_own_display);
    assert!(!fit(pixels(1920, 1080), retina).fullscreen_on_own_display);
    assert!(!fit(pixels(7680, 4320), retina).fullscreen_on_own_display);
}

#[test]
fn a_pixel_size_is_a_whole_number_of_pixels_from_320_to_7680_each_way() {
    assert!(PixelSize::new(320, 320).is_ok());
    assert!(PixelSize::new(7680, 7680).is_ok());
    assert!(PixelSize::new(319, 1080).is_err());
    assert!(PixelSize::new(1920, 7681).is_err());
    assert!(PixelSize::new(0, 0).is_err());
}

#[test]
fn a_written_size_outside_the_bounds_is_refused() {
    let read = |json| serde_json::from_str::<PresentationSize>(json);

    assert_eq!(
        read(r#"{"width": 1080, "height": 1920}"#).unwrap(),
        pixels(1080, 1920)
    );
    assert_eq!(
        read(r#""fillDisplay""#).unwrap(),
        PresentationSize::FillDisplay
    );
    assert!(read(r#"{"width": 100, "height": 1920}"#).is_err());
    assert!(read(r#"{"width": 1080.5, "height": 1920}"#).is_err());
}

#[test]
fn a_size_is_written_as_its_pixels_or_fill_display() {
    assert_eq!(
        serde_json::to_value(pixels(1080, 1920)).unwrap(),
        serde_json::json!({"width": 1080, "height": 1920})
    );
    assert_eq!(
        serde_json::to_value(PresentationSize::FillDisplay).unwrap(),
        serde_json::json!("fillDisplay")
    );
}

#[test]
fn the_presentation_size_defaults_to_1920_by_1080() {
    assert_eq!(PresentationSize::default(), pixels(1920, 1080));
}

#[test]
fn the_size_presets_are_grouped_by_shape() {
    let presets: Vec<_> = SIZE_PRESETS
        .iter()
        .map(|preset| (preset.size, preset.shape))
        .collect();

    assert_eq!(
        presets,
        [
            (PixelSize::new(1280, 720).unwrap(), Shape::Landscape),
            (PixelSize::new(1920, 1080).unwrap(), Shape::Landscape),
            (PixelSize::new(2560, 1440).unwrap(), Shape::Landscape),
            (PixelSize::new(3840, 2160).unwrap(), Shape::Landscape),
            (PixelSize::new(720, 1280).unwrap(), Shape::Vertical),
            (PixelSize::new(1080, 1920).unwrap(), Shape::Vertical),
            (PixelSize::new(1080, 1080).unwrap(), Shape::Square),
            (PixelSize::new(1080, 1350).unwrap(), Shape::Portrait),
        ]
    );
}

#[test]
fn a_pixel_size_equal_to_a_preset_is_that_preset() {
    let vertical = PixelSize::new(1080, 1920).unwrap();

    assert_eq!(
        vertical.preset().map(|preset| preset.shape),
        Some(Shape::Vertical)
    );
    assert_eq!(PixelSize::new(1000, 1000).unwrap().preset(), None);
}

#[test]
fn a_preset_is_offered_as_its_pixels_and_shape() {
    assert_eq!(
        serde_json::to_value(SIZE_PRESETS[5]).unwrap(),
        serde_json::json!({"width": 1080, "height": 1920, "shape": "vertical"})
    );
}
