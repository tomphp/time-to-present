use serde_json::json;
use ttp_core::clock::{
    Cause, ClockState, ClockView, EventPayload, PROTOCOL_VERSION, Snapshot, StreamEvent,
    WordPayload,
};
use ttp_core::session::Session;

use crate::support::{Harness, Stream};

fn clock(state: ClockState, script_time: i64, speed: f64, cause: Cause) -> StreamEvent {
    StreamEvent::Clock {
        state,
        script_time,
        speed,
        cause,
    }
}

fn tick(script_time: i64) -> StreamEvent {
    StreamEvent::Tick { script_time }
}

fn slide_at_start() -> StreamEvent {
    StreamEvent::NamedEvent(EventPayload {
        id: "e1".into(),
        name: "slide".into(),
        data: json!({"index": 1}),
        script_time: 0,
    })
}

fn hello() -> StreamEvent {
    StreamEvent::Word(WordPayload {
        id: "w1".into(),
        text: "Hello,".into(),
        start: 400,
        duration: 300,
    })
}

#[test]
fn a_fresh_session_is_ready_at_script_time_0_with_nothing_passed() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);

    assert_eq!(
        session.snapshot(),
        Snapshot {
            protocol_version: PROTOCOL_VERSION,
            script_version: 1,
            clock: ClockView {
                state: ClockState::Ready,
                script_time: 0,
                speed: 1.0,
            },
            current_word: None,
            passed_events: vec![],
        }
    );
}

#[test]
fn play_from_ready_fires_the_named_events_at_script_time_0() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let stream = Stream::of(&mut session);

    session.play();

    assert_eq!(
        stream.take(),
        [
            clock(ClockState::Playing, 0, 1.0, Cause::Play),
            slide_at_start()
        ]
    );
}

#[test]
fn while_playing_ticks_come_at_10_hz_and_words_as_they_start() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.play();
    let stream = Stream::of(&mut session);

    for _ in 0..4 {
        harness.advance(100);
        session.poll().unwrap();
    }

    assert_eq!(
        stream.take(),
        [tick(100), tick(200), tick(300), hello(), tick(400)]
    );
}

fn play_for(harness: &Harness, session: &mut Session, ms: i64) {
    session.play();
    harness.advance(ms);
    session.poll().unwrap();
}

#[test]
fn pause_keeps_script_time_and_play_resumes_from_it() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    play_for(&harness, &mut session, 350);
    let stream = Stream::of(&mut session);

    harness.advance(60);
    session.pause();
    harness.advance(1_000);
    session.poll().unwrap();
    session.play();
    harness.advance(100);
    session.poll().unwrap();

    assert_eq!(
        stream.take(),
        [
            hello(),
            clock(ClockState::Paused, 410, 1.0, Cause::Pause),
            clock(ClockState::Playing, 410, 1.0, Cause::Play),
            tick(510),
        ]
    );
}

#[test]
fn reaching_script_end_fires_what_is_left_and_ends_the_clock() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    play_for(&harness, &mut session, 1_500);
    let stream = Stream::of(&mut session);

    harness.advance(5_000);
    session.poll().unwrap();
    session.play();
    harness.advance(100);
    session.poll().unwrap();

    assert_eq!(
        stream.take(),
        [
            StreamEvent::NamedEvent(EventPayload {
                id: "e2".into(),
                name: "confetti".into(),
                data: serde_json::Value::Null,
                script_time: 2_200,
            }),
            clock(ClockState::Ended, 2_200, 1.0, Cause::End),
        ]
    );
    assert_eq!(session.snapshot().clock.state, ClockState::Ended);
    assert_eq!(session.snapshot().current_word.unwrap().id, "w3");
}

#[test]
fn a_seek_sends_a_snapshot_and_never_replays_what_it_skipped() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    play_for(&harness, &mut session, 200);
    let stream = Stream::of(&mut session);

    session.seek(1_400);
    harness.advance(100);
    session.poll().unwrap();

    let snapshot = session.snapshot();
    assert_eq!(snapshot.clock.state, ClockState::Playing);
    assert_eq!(snapshot.current_word.as_ref().unwrap().id, "w3");
    assert_eq!(snapshot.passed_events.len(), 1);
    assert_eq!(
        stream.take(),
        [
            StreamEvent::Snapshot(Snapshot {
                clock: ClockView {
                    state: ClockState::Playing,
                    script_time: 1_400,
                    speed: 1.0,
                },
                ..snapshot
            }),
            tick(1_500)
        ]
    );
}

#[test]
fn a_seek_from_ended_leaves_the_clock_paused_and_from_ready_too() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.seek(500);
    assert_eq!(session.snapshot().clock.state, ClockState::Paused);
    assert_eq!(session.snapshot().current_word.unwrap().id, "w1");

    play_for(&harness, &mut session, 5_000);
    assert_eq!(session.snapshot().clock.state, ClockState::Ended);
    session.seek(-50);

    assert_eq!(
        session.snapshot().clock,
        ClockView {
            state: ClockState::Paused,
            script_time: 0,
            speed: 1.0,
        }
    );
    assert_eq!(session.snapshot().passed_events[0].id, "e1");
}

#[test]
fn a_seek_past_script_end_is_clamped_to_it() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.seek(99_999);
    assert_eq!(session.snapshot().clock.script_time, 2_200);
}

#[test]
fn speed_runs_in_0_05_steps_between_0_5_and_2_and_scales_script_time() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let stream = Stream::of(&mut session);

    session.set_speed(2.5);
    session.set_speed(0.1);
    session.set_speed(1.14);
    session.play();
    harness.advance(100);
    session.poll().unwrap();

    assert_eq!(
        stream.take(),
        [
            clock(ClockState::Ready, 0, 2.0, Cause::Speed),
            clock(ClockState::Ready, 0, 0.5, Cause::Speed),
            clock(ClockState::Ready, 0, 1.15, Cause::Speed),
            clock(ClockState::Playing, 0, 1.15, Cause::Play),
            slide_at_start(),
            tick(115),
        ]
    );
}

#[test]
fn a_speed_change_while_playing_applies_from_that_moment() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    play_for(&harness, &mut session, 100);
    let stream = Stream::of(&mut session);

    session.set_speed(2.0);
    harness.advance(100);
    session.poll().unwrap();

    assert_eq!(
        stream.take(),
        [
            clock(ClockState::Playing, 100, 2.0, Cause::Speed),
            tick(300)
        ]
    );
}

#[test]
fn speed_is_kept_across_pause_seek_and_reset_and_a_repeat_is_silent() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.set_speed(1.5);
    session.play();
    session.pause();
    session.seek(600);
    session.reset();
    let stream = Stream::of(&mut session);

    session.set_speed(1.5);

    assert_eq!(stream.take(), []);
    assert_eq!(session.snapshot().clock.speed, 1.5);
}

#[test]
fn reset_returns_to_ready_so_play_fires_script_time_0_again() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    play_for(&harness, &mut session, 500);
    let stream = Stream::of(&mut session);

    session.reset();
    session.reset();
    session.play();

    assert_eq!(
        stream.take(),
        [
            clock(ClockState::Ready, 0, 1.0, Cause::Reset),
            clock(ClockState::Playing, 0, 1.0, Cause::Play),
            slide_at_start(),
        ]
    );
}

#[test]
fn a_stall_or_high_speed_still_fires_everything_crossed_in_order() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    session.set_speed(2.0);
    session.play();
    let stream = Stream::of(&mut session);

    harness.advance(800);
    session.poll().unwrap();

    let ids: Vec<String> = stream
        .take()
        .into_iter()
        .map(|event| match event {
            StreamEvent::Word(word) => word.id,
            StreamEvent::Tick { script_time } => format!("tick {script_time}"),
            other => format!("{other:?}"),
        })
        .collect();
    assert_eq!(ids, ["w1", "w2", "w3", "tick 1600"]);
}
