use ttp_core::clock::ClockState;
use ttp_core::menu::{
    EditorReport, FocusedWindow, KeyWindow, MenuCommand, MenuContext, MenuItemState, Route,
    TeleprompterReport, menu_item,
};
use ttp_core::perform::PerformanceLayout;

fn context(focused: FocusedWindow) -> MenuContext {
    MenuContext {
        focused,
        presentation_open: true,
        layout: PerformanceLayout::TwoWindows,
    }
}

fn window_level() -> impl Iterator<Item = MenuCommand> {
    MenuCommand::ALL
        .into_iter()
        .filter(|command| command.route() == Route::Window)
}

#[test]
fn nothing_window_level_is_enabled_for_a_window_that_has_reported_nothing() {
    for focused in [
        FocusedWindow::Editor(None),
        FocusedWindow::Teleprompter {
            fullscreen: false,
            report: None,
        },
    ] {
        for command in window_level() {
            assert!(
                !menu_item(command, &context(focused)).enabled,
                "{command:?} in {focused:?}"
            );
        }
    }
}

const EDITOR: EditorReport = EditorReport {
    recording: false,
    selection: false,
    retimable: false,
    listenable: false,
    locked: false,
    clock: Some(ClockState::Ready),
    inspector_shown: true,
    timeline_shown: true,
};

const TELEPROMPTER: TeleprompterReport = TeleprompterReport {
    blanked: false,
    markers: false,
    mirrored: false,
    flipped: false,
};

const SCRIPT_AND_EDITOR_VIEW: [MenuCommand; 9] = [
    MenuCommand::RemoveUnusedRecordings,
    MenuCommand::Record,
    MenuCommand::AddNamedEvent,
    MenuCommand::LayoutTwoWindows,
    MenuCommand::LayoutCombined,
    MenuCommand::LayoutTeleprompterOnly,
    MenuCommand::PlayFromCursor,
    MenuCommand::ToggleInspector,
    MenuCommand::ToggleTimeline,
];

const TELEPROMPTER_OPTIONS: [MenuCommand; 8] = [
    MenuCommand::Blank,
    MenuCommand::Markers,
    MenuCommand::Mirror,
    MenuCommand::Flip,
    MenuCommand::FontLarger,
    MenuCommand::FontSmaller,
    MenuCommand::ReadingLineUp,
    MenuCommand::ReadingLineDown,
];

fn enabled(command: MenuCommand, focused: FocusedWindow) -> bool {
    menu_item(command, &context(focused)).enabled
}

fn teleprompter(report: TeleprompterReport) -> FocusedWindow {
    FocusedWindow::Teleprompter {
        fullscreen: false,
        report: Some(report),
    }
}

#[test]
fn the_editor_enables_its_own_items_and_not_the_teleprompters() {
    let editor = FocusedWindow::Editor(Some(EDITOR));
    for command in SCRIPT_AND_EDITOR_VIEW {
        assert!(enabled(command, editor), "{command:?}");
    }
    for command in TELEPROMPTER_OPTIONS {
        assert!(!enabled(command, editor), "{command:?}");
    }
}

#[test]
fn a_teleprompter_window_enables_its_display_options_and_not_the_editors() {
    for command in TELEPROMPTER_OPTIONS {
        assert!(enabled(command, teleprompter(TELEPROMPTER)), "{command:?}");
    }
    for command in SCRIPT_AND_EDITOR_VIEW {
        assert!(!enabled(command, teleprompter(TELEPROMPTER)), "{command:?}");
    }
}

#[test]
fn window_level_items_are_disabled_without_a_window_that_has_them() {
    for focused in [
        FocusedWindow::None,
        FocusedWindow::Other,
        FocusedWindow::Presentation { fullscreen: false },
    ] {
        for command in window_level() {
            assert!(!enabled(command, focused), "{command:?} in {focused:?}");
        }
    }
}

#[test]
fn settings_and_starting_a_presentation_work_from_any_window() {
    for focused in [
        FocusedWindow::None,
        FocusedWindow::Other,
        FocusedWindow::Editor(None),
        teleprompter(TELEPROMPTER),
    ] {
        for command in [
            MenuCommand::Settings,
            MenuCommand::NewPresentation,
            MenuCommand::OpenFolder,
            MenuCommand::Perform,
        ] {
            assert!(enabled(command, focused), "{command:?} in {focused:?}");
        }
    }
}

#[test]
fn perform_needs_an_open_presentation() {
    let closed = MenuContext {
        presentation_open: false,
        ..context(FocusedWindow::Other)
    };

    assert!(!menu_item(MenuCommand::Perform, &closed).enabled);
}

#[test]
fn the_full_screen_item_is_disabled_without_a_focused_performance_window() {
    for focused in [
        FocusedWindow::None,
        FocusedWindow::Other,
        FocusedWindow::Editor(Some(EDITOR)),
    ] {
        assert!(
            !enabled(MenuCommand::ToggleFullscreen, focused),
            "{focused:?}"
        );
    }
}

#[test]
fn a_fullscreen_performance_window_offers_to_exit_full_screen() {
    for focused in [
        FocusedWindow::Presentation { fullscreen: true },
        FocusedWindow::Teleprompter {
            fullscreen: true,
            report: None,
        },
    ] {
        assert_eq!(
            menu_item(MenuCommand::ToggleFullscreen, &context(focused)),
            MenuItemState {
                enabled: true,
                label: "Exit Full Screen",
                checked: false,
            }
        );
    }
}

#[test]
fn a_windowed_performance_window_offers_to_enter_full_screen() {
    assert_eq!(
        menu_item(
            MenuCommand::ToggleFullscreen,
            &context(FocusedWindow::Presentation { fullscreen: false })
        ),
        MenuItemState {
            enabled: true,
            label: "Enter Full Screen",
            checked: false,
        }
    );
}

fn in_editor(command: MenuCommand, report: EditorReport) -> MenuItemState {
    menu_item(command, &context(FocusedWindow::Editor(Some(report))))
}

#[test]
fn record_offers_to_stop_while_recording() {
    let recording = EditorReport {
        recording: true,
        locked: true,
        ..EDITOR
    };

    assert_eq!(in_editor(MenuCommand::Record, EDITOR).label, "Record");
    assert_eq!(
        in_editor(MenuCommand::Record, recording),
        MenuItemState {
            enabled: true,
            label: "Stop",
            checked: false,
        }
    );
}

#[test]
fn play_pause_offers_to_pause_while_the_clock_plays() {
    let playing = EditorReport {
        clock: Some(ClockState::Playing),
        locked: true,
        ..EDITOR
    };

    assert_eq!(in_editor(MenuCommand::PlayPause, EDITOR).label, "Play");
    assert_eq!(in_editor(MenuCommand::PlayPause, playing).label, "Pause");
    assert!(in_editor(MenuCommand::PlayPause, playing).enabled);
}

#[test]
fn re_record_selection_needs_selected_words_and_no_recording_under_way() {
    let selected = EditorReport {
        selection: true,
        ..EDITOR
    };
    let recording = EditorReport {
        recording: true,
        locked: true,
        ..selected
    };

    assert!(!in_editor(MenuCommand::ReRecordSelection, EDITOR).enabled);
    assert!(in_editor(MenuCommand::ReRecordSelection, selected).enabled);
    assert!(!in_editor(MenuCommand::ReRecordSelection, recording).enabled);
}

#[test]
fn recording_works_while_the_clock_plays() {
    let playing = EditorReport {
        selection: true,
        clock: Some(ClockState::Playing),
        locked: true,
        ..EDITOR
    };

    assert!(in_editor(MenuCommand::Record, playing).enabled);
    assert!(in_editor(MenuCommand::ReRecordSelection, playing).enabled);
}

#[test]
fn retime_needs_words_to_retime_and_add_named_event_does_not() {
    let caret_in_a_word = EditorReport {
        retimable: true,
        ..EDITOR
    };
    let recording_target_only = EditorReport {
        selection: true,
        ..EDITOR
    };

    assert!(!in_editor(MenuCommand::Retime, EDITOR).enabled);
    assert!(!in_editor(MenuCommand::Retime, recording_target_only).enabled);
    assert!(in_editor(MenuCommand::Retime, caret_in_a_word).enabled);
    assert!(in_editor(MenuCommand::AddNamedEvent, EDITOR).enabled);
}

#[test]
fn the_edit_lock_disables_script_commands() {
    let playing = EditorReport {
        selection: true,
        retimable: true,
        clock: Some(ClockState::Playing),
        locked: true,
        ..EDITOR
    };
    for command in [
        MenuCommand::AddNamedEvent,
        MenuCommand::Retime,
        MenuCommand::PlayFromCursor,
    ] {
        assert!(!in_editor(command, playing).enabled, "{command:?}");
    }
}

#[test]
fn restart_is_enabled_once_the_performance_has_ended() {
    let ended = EditorReport {
        clock: Some(ClockState::Ended),
        ..EDITOR
    };

    assert!(!in_editor(MenuCommand::Restart, EDITOR).enabled);
    assert!(in_editor(MenuCommand::Restart, ended).enabled);
    assert!(!in_editor(MenuCommand::PlayPause, ended).enabled);
}

#[test]
fn the_clock_items_wait_for_the_editor_to_hear_the_clock() {
    let unheard = EditorReport {
        clock: None,
        ..EDITOR
    };

    assert!(!in_editor(MenuCommand::PlayPause, unheard).enabled);
    assert!(!in_editor(MenuCommand::Restart, unheard).enabled);
}

#[test]
fn listen_follows_what_the_editor_can_sound() {
    let listenable = EditorReport {
        listenable: true,
        ..EDITOR
    };

    assert!(!in_editor(MenuCommand::Listen, EDITOR).enabled);
    assert!(in_editor(MenuCommand::Listen, listenable).enabled);
}

#[test]
fn the_current_performance_layout_is_checked() {
    let combined = MenuContext {
        layout: PerformanceLayout::Combined,
        ..context(FocusedWindow::Editor(Some(EDITOR)))
    };
    let checked = |command| menu_item(command, &combined).checked;

    assert!(checked(MenuCommand::LayoutCombined));
    assert!(!checked(MenuCommand::LayoutTwoWindows));
    assert!(!checked(MenuCommand::LayoutTeleprompterOnly));
}

#[test]
fn the_inspector_and_timeline_items_offer_the_opposite_of_what_is_shown() {
    let hidden = EditorReport {
        inspector_shown: false,
        timeline_shown: false,
        ..EDITOR
    };

    assert_eq!(
        in_editor(MenuCommand::ToggleInspector, EDITOR).label,
        "Hide Inspector"
    );
    assert_eq!(
        in_editor(MenuCommand::ToggleInspector, hidden).label,
        "Show Inspector"
    );
    assert_eq!(
        in_editor(MenuCommand::ToggleTimeline, EDITOR).label,
        "Hide Timeline"
    );
    assert_eq!(
        in_editor(MenuCommand::ToggleTimeline, hidden).label,
        "Show Timeline"
    );
}

#[test]
fn the_teleprompter_options_are_checked_as_the_window_reports_them() {
    let checked = |command, report| menu_item(command, &context(teleprompter(report))).checked;
    let options = [
        (
            MenuCommand::Blank,
            TeleprompterReport {
                blanked: true,
                ..TELEPROMPTER
            },
        ),
        (
            MenuCommand::Markers,
            TeleprompterReport {
                markers: true,
                ..TELEPROMPTER
            },
        ),
        (
            MenuCommand::Mirror,
            TeleprompterReport {
                mirrored: true,
                ..TELEPROMPTER
            },
        ),
        (
            MenuCommand::Flip,
            TeleprompterReport {
                flipped: true,
                ..TELEPROMPTER
            },
        ),
    ];
    for (command, on) in options {
        assert!(checked(command, on), "{command:?}");
        assert!(!checked(command, TELEPROMPTER), "{command:?}");
    }
}

#[test]
fn the_teleprompter_options_are_unchecked_for_a_teleprompter_that_has_reported_nothing() {
    let unreported = FocusedWindow::Teleprompter {
        fullscreen: false,
        report: None,
    };
    for command in TELEPROMPTER_OPTIONS {
        assert!(
            !menu_item(command, &context(unreported)).checked,
            "{command:?}"
        );
    }
}

#[test]
fn the_teleprompter_display_keys_are_in_their_titles_and_not_accelerators() {
    let titles =
        TELEPROMPTER_OPTIONS.map(|command| menu_item(command, &context(FocusedWindow::None)).label);

    assert_eq!(
        titles,
        [
            "Blank Screen (B / .)",
            "Show Named Event Markers (E)",
            "Mirror (M)",
            "Flip (⇧M)",
            "Larger Text (⌘+)",
            "Smaller Text (⌘−)",
            "Raise Reading Line (⌘↑)",
            "Lower Reading Line (⌘↓)",
        ]
    );
    for command in TELEPROMPTER_OPTIONS {
        assert_eq!(command.accelerator(), None, "{command:?}");
    }
}

#[test]
fn the_global_shortcuts_are_menu_accelerators() {
    assert_eq!(MenuCommand::Settings.accelerator(), Some("Cmd+,"));
    assert_eq!(MenuCommand::Record.accelerator(), Some("Cmd+R"));
    assert_eq!(MenuCommand::Perform.accelerator(), Some("Shift+Cmd+P"));
    assert_eq!(
        MenuCommand::ToggleFullscreen.accelerator(),
        Some("Ctrl+Cmd+F")
    );
}

#[test]
fn add_named_event_shows_the_scripts_own_key_and_leaves_it_to_the_script() {
    assert_eq!(
        in_editor(MenuCommand::AddNamedEvent, EDITOR).label,
        "Add Named Event (⌘E)"
    );
    assert_eq!(MenuCommand::AddNamedEvent.accelerator(), None);
}

#[test]
fn the_editors_window_keys_are_never_menu_accelerators_so_each_runs_once() {
    for command in MenuCommand::ALL {
        assert!(
            !matches!(command.accelerator(), Some("Cmd+E" | "Cmd+'")),
            "{command:?}"
        );
    }
}

#[test]
fn commands_without_a_shortcut_get_none() {
    for command in [
        MenuCommand::ToggleInspector,
        MenuCommand::ToggleTimeline,
        MenuCommand::PlayPause,
        MenuCommand::PlayFromCursor,
    ] {
        assert_eq!(command.accelerator(), None, "{command:?}");
    }
}

#[test]
fn every_command_is_known_by_its_id() {
    for command in MenuCommand::ALL {
        assert_eq!(MenuCommand::from_id(command.id()), Some(command));
    }
    assert_eq!(MenuCommand::Mirror.id(), "mirror");
    assert_eq!(MenuCommand::FontLarger.id(), "fontLarger");
    assert_eq!(MenuCommand::from_id("open-recent"), None);
}

#[test]
fn the_key_window_is_the_one_that_last_gained_focus() {
    let mut key_window = KeyWindow::default();
    key_window.focus_changed("editor", true);
    key_window.focus_changed("editor", false);
    key_window.focus_changed("teleprompter", true);

    assert_eq!(key_window.label(), Some("teleprompter"));
}

#[test]
fn focus_lost_after_another_window_gained_it_leaves_that_window_key() {
    let mut key_window = KeyWindow::default();
    key_window.focus_changed("editor", true);
    key_window.focus_changed("teleprompter", true);
    key_window.focus_changed("editor", false);

    assert_eq!(key_window.label(), Some("teleprompter"));
}

#[test]
fn no_window_is_key_once_the_key_window_loses_focus() {
    let mut key_window = KeyWindow::default();
    key_window.focus_changed("editor", true);
    key_window.focus_changed("editor", false);

    assert_eq!(key_window.label(), None);
}
