use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use ttp_core::perform::{PixelSize, PresentationSize};

use crate::support::{Harness, correct};

fn vertical() -> PresentationSize {
    PresentationSize::Pixels(PixelSize::new(1080, 1920).unwrap())
}

fn written(folder: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(folder.join("presentation.json")).unwrap()).unwrap()
}

#[test]
fn setting_the_presentation_size_saves_it_at_once_and_it_survives_reopening() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.set_presentation_size(vertical()).unwrap();

    let reopened = harness.open(&folder).state();
    assert_eq!(reopened.presentation_size, vertical());
    assert_eq!(reopened, session.state());
}

#[test]
fn setting_the_presentation_size_saves_a_script_edit_waiting_for_autosave_with_it() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.edit(correct("w1", "Hullo,")).unwrap();

    session.set_presentation_size(vertical()).unwrap();

    assert_eq!(harness.open(&folder).state(), session.state());
}

#[test]
fn setting_the_presentation_size_publishes_it_to_subscribers() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let sizes = Arc::new(Mutex::new(Vec::new()));
    let sink = sizes.clone();
    session.subscribe(move |state| sink.lock().unwrap().push(state.presentation_size));

    session
        .set_presentation_size(PresentationSize::FillDisplay)
        .unwrap();

    assert_eq!(
        *sizes.lock().unwrap(),
        [PresentationSize::default(), PresentationSize::FillDisplay]
    );
}

#[test]
fn the_presentation_size_can_change_while_the_clock_plays() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.play();

    session.set_presentation_size(vertical()).unwrap();

    assert_eq!(session.state().presentation_size, vertical());
    assert!(session.state().locked);
}

#[test]
fn a_presentation_saved_without_a_size_opens_at_1920_by_1080_and_is_not_rewritten() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut document = written(&folder);
    document.as_object_mut().unwrap().remove("presentationSize");
    let before = serde_json::to_string_pretty(&document).unwrap();
    fs::write(folder.join("presentation.json"), &before).unwrap();

    let state = harness.open(&folder).state();

    assert_eq!(
        state.presentation_size,
        PresentationSize::Pixels(PixelSize::new(1920, 1080).unwrap())
    );
    assert_eq!(
        fs::read_to_string(folder.join("presentation.json")).unwrap(),
        before
    );
}

#[test]
fn a_new_presentation_starts_at_1920_by_1080() {
    let harness = Harness::new();

    let session = harness.create("My Talk");

    assert_eq!(
        session.state().presentation_size,
        PresentationSize::Pixels(PixelSize::new(1920, 1080).unwrap())
    );
    assert_eq!(
        written(&session.state().folder)["presentationSize"],
        json!({"width": 1920, "height": 1080})
    );
}

#[test]
fn a_pixel_size_and_fill_display_are_each_written_in_their_own_form() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let forms = [
        (vertical(), json!({"width": 1080, "height": 1920})),
        (PresentationSize::FillDisplay, json!("fillDisplay")),
    ];

    for (size, form) in forms {
        session.set_presentation_size(size).unwrap();

        assert_eq!(written(&folder)["presentationSize"], form);
        assert_eq!(harness.open(&folder).state().presentation_size, size);
    }
}
