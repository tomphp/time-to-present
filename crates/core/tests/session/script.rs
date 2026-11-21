use serde_json::json;
use ttp_core::script::Edit;

use crate::support::{Harness, correct};

#[test]
fn the_published_script_has_absolute_starts_and_resolved_event_times() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let session = harness.open(&folder);

    assert_eq!(
        serde_json::to_value(session.script()).unwrap(),
        json!({
            "protocolVersion": 1,
            "scriptVersion": 1,
            "scriptEnd": 2200,
            "words": [
                {"id": "w1", "text": "Hello,", "start": 400, "duration": 300},
                {"id": "w2", "text": "world.", "start": 850, "duration": 450, "breakAfter": "paragraph"},
                {"id": "w3", "text": "Typed", "start": 1400, "duration": 300},
            ],
            "namedEvents": [
                {"id": "e1", "name": "slide", "data": {"index": 1}, "scriptTime": 0},
                {"id": "e2", "name": "confetti", "data": null, "scriptTime": 2200},
            ],
        })
    );
}

#[test]
fn named_events_resolving_before_script_start_are_published_at_0_in_firing_order() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session
        .edit(Edit::SetOffset {
            event: "e2".into(),
            offset: -2000,
        })
        .unwrap();

    let published = serde_json::to_value(session.script()).unwrap();
    assert_eq!(published["namedEvents"][0]["id"], "e1");
    assert_eq!(published["namedEvents"][1]["id"], "e2");
    assert_eq!(published["namedEvents"][1]["scriptTime"], 0);
}

#[test]
fn every_saved_edit_publishes_the_script_at_a_new_version() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    session.edit(correct("w3", "Typed!")).unwrap();

    let published = serde_json::to_value(session.script()).unwrap();
    assert_eq!(published["scriptVersion"], 2);
    assert_eq!(published["words"][2]["text"], "Typed!");
}
