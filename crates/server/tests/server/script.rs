use serde_json::json;
use ttp_core::script::Edit;

use crate::support::Harness;

#[tokio::test]
async fn the_script_has_absolute_word_starts_and_named_event_script_times() {
    let harness = Harness::start().await;
    harness.open_hello();

    let script = harness.get("/_ttp/v1/script").await;

    assert_eq!(script.status(), 200);
    assert_eq!(script.headers()["content-type"], "application/json");
    assert_eq!(
        script.json::<serde_json::Value>().await.unwrap(),
        json!({
            "protocolVersion": 1,
            "scriptVersion": 1,
            "scriptEnd": 1300,
            "words": [
                {"id": "w1", "text": "Hello,", "start": 400, "duration": 300},
                {"id": "w2", "text": "world.", "start": 850, "duration": 450, "breakAfter": "paragraph"},
            ],
            "namedEvents": [
                {"id": "e1", "name": "slide", "data": {"index": 1}, "scriptTime": 0},
                {"id": "e2", "name": "confetti", "data": null, "scriptTime": 950},
            ],
        })
    );
}

#[tokio::test]
async fn the_script_follows_each_saved_edit() {
    let harness = Harness::start().await;
    harness.open_hello();

    harness.with_session(|session| {
        session
            .edit(Edit::Correct {
                word: "w2".into(),
                text: "there.".into(),
            })
            .unwrap()
    });

    let script: serde_json::Value = harness.get("/_ttp/v1/script").await.json().await.unwrap();
    assert_eq!(script["scriptVersion"], 2);
    assert_eq!(script["words"][1]["text"], "there.");
}

#[tokio::test]
async fn with_nothing_open_the_script_answers_503() {
    let harness = Harness::start().await;

    assert_eq!(harness.get("/_ttp/v1/script").await.status(), 503);
}
