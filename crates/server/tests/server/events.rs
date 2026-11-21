use serde_json::json;

use crate::support::Harness;

#[tokio::test]
async fn every_connection_starts_with_a_snapshot_and_a_one_second_retry() {
    let harness = Harness::start().await;
    harness.open_hello();

    let mut events = harness.connect().await;
    let first = events.expect().await;

    assert_eq!(events.status, 200);
    assert_eq!(first.event, "snapshot");
    assert_eq!(first.retry, Some(1000));
    assert!(first.id.is_some());
    assert_eq!(
        first.data,
        json!({
            "type": "snapshot",
            "protocolVersion": 1,
            "scriptVersion": 1,
            "clock": {"state": "ready", "scriptTime": 0, "speed": 1.0},
            "currentWord": null,
            "passedEvents": [],
        })
    );
}

#[tokio::test]
async fn every_client_receives_the_same_broadcast_in_order() {
    let harness = Harness::start().await;
    harness.open_hello();
    let mut first = harness.connect().await;
    let mut second = harness.connect().await;
    first.expect().await;
    second.expect().await;

    harness.with_session(|session| session.play());
    harness.advance(400);
    harness.with_session(|session| session.poll().unwrap());

    for events in [&mut first, &mut second] {
        let names = [
            events.expect().await,
            events.expect().await,
            events.expect().await,
            events.expect().await,
        ]
        .map(|message| message.event);
        assert_eq!(names, ["clock", "namedEvent", "word", "tick"]);
    }
}

#[tokio::test]
async fn the_sse_id_counts_up_across_the_stream_and_is_never_repeated() {
    let harness = Harness::start().await;
    harness.open_hello();
    let mut events = harness.connect().await;

    let snapshot = events.expect().await;
    harness.with_session(|session| session.play());
    let clock = events.expect().await;
    let slide = events.expect().await;

    let ids = [snapshot.id, clock.id, slide.id].map(Option::unwrap);
    assert!(ids[0] < ids[1] && ids[1] < ids[2], "{ids:?}");
}

#[tokio::test]
async fn a_late_connection_gets_where_the_performance_stands_and_no_replay() {
    let harness = Harness::start().await;
    harness.open_hello();
    harness.with_session(|session| session.play());
    harness.advance(500);
    harness.with_session(|session| session.pause());

    let mut events = harness.connect().await;
    let snapshot = events.expect().await;

    assert_eq!(snapshot.event, "snapshot");
    assert_eq!(snapshot.data["clock"]["state"], "paused");
    assert_eq!(snapshot.data["clock"]["scriptTime"], 500);
    assert_eq!(snapshot.data["currentWord"]["id"], "w1");
    assert_eq!(snapshot.data["passedEvents"][0]["id"], "e1");
    harness.with_session(|session| session.seek(0));
    assert_eq!(events.expect().await.event, "snapshot");
}

#[tokio::test]
async fn with_nothing_open_the_stream_answers_503() {
    let harness = Harness::start().await;

    assert_eq!(harness.connect().await.status, 503);
}

#[tokio::test]
async fn closing_sends_closed_and_ends_every_stream() {
    let harness = Harness::start().await;
    harness.open_hello();
    let mut first = harness.connect().await;
    let mut second = harness.connect().await;
    first.expect().await;
    second.expect().await;

    harness.close();

    for events in [&mut first, &mut second] {
        let closed = events.expect().await;
        assert_eq!(closed.event, "closed");
        assert_eq!(closed.data, json!({"type": "closed", "reason": "closed"}));
        events.expect_end().await;
    }
    assert_eq!(harness.connect().await.status, 503);
}

#[tokio::test]
async fn switching_presentations_closes_the_old_stream_and_reconnecting_gets_the_new_one() {
    let harness = Harness::start().await;
    harness.open_hello();
    let mut old = harness.connect().await;
    old.expect().await;

    harness.open("other", json!([]), json!([]));

    assert_eq!(old.expect().await.event, "closed");
    old.expect_end().await;
    let mut new = harness.connect().await;
    let snapshot = new.expect().await;
    assert_eq!(snapshot.event, "snapshot");
    assert_eq!(snapshot.data["currentWord"], json!(null));
    harness.with_session(|session| session.play());
    assert_eq!(new.expect().await.data["cause"], "play");
}

#[tokio::test]
async fn the_connected_app_count_follows_the_sse_connections() {
    let harness = Harness::start().await;
    harness.open_hello();
    harness.until_connected_apps(0).await;

    let mut first = harness.connect().await;
    let second = harness.connect().await;
    first.expect().await;
    harness.until_connected_apps(2).await;
    assert_eq!(harness.server.status().connected_apps, 2);

    drop(second);
    harness.until_connected_apps(1).await;
    harness.close();
    harness.until_connected_apps(0).await;
}
