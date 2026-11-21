//! Runs every shared protocol fixture through the Session and holds it to the exact stream.

use std::fs;
use std::path::Path;

use serde::Deserialize;
use serde_json::{Value, json};
use ttp_core::clock::StreamEvent;
use ttp_core::session::Session;

use crate::support::{Harness, Stream};

#[derive(Deserialize)]
struct Fixture {
    script: Value,
    steps: Vec<Step>,
    stream: Vec<Value>,
}

#[derive(Deserialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Step {
    Advance { ms: i64 },
    Connect,
    Play,
    Pause,
    Seek { script_time: i64 },
    Speed { speed: f64 },
    Reset,
    Close,
}

fn fixtures() -> Vec<(String, Fixture)> {
    let folder = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../protocol-fixtures");
    let mut fixtures: Vec<(String, Fixture)> = fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .map(|path| {
            let name = path.file_stem().unwrap().to_string_lossy().into_owned();
            let fixture = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
            (name, fixture)
        })
        .collect();
    fixtures.sort_by(|a, b| a.0.cmp(&b.0));
    assert!(!fixtures.is_empty(), "no protocol fixtures found");
    fixtures
}

fn open_with_script(harness: &Harness, name: &str, script: &Value) -> Session {
    let folder = harness.parent().join(name);
    fs::create_dir(&folder).unwrap();
    let presentation = json!({
        "formatVersion": 1,
        "title": name,
        "recordings": [],
        "words": script["words"],
        "namedEvents": script["namedEvents"],
    });
    fs::write(folder.join("presentation.json"), presentation.to_string()).unwrap();
    harness.open(&folder)
}

fn run(harness: &Harness, name: &str, fixture: &Fixture) -> Vec<Value> {
    let mut session = open_with_script(harness, name, &fixture.script);
    let stream = Stream::of(&mut session);
    let mut produced = Vec::new();
    for step in &fixture.steps {
        let snapshot = match step {
            Step::Advance { ms } => {
                harness.advance(*ms);
                session.poll().unwrap();
                None
            }
            Step::Connect => Some(StreamEvent::Snapshot(session.snapshot())),
            Step::Play => {
                session.play();
                None
            }
            Step::Pause => {
                session.pause();
                None
            }
            Step::Seek { script_time } => {
                session.seek(*script_time);
                None
            }
            Step::Speed { speed } => {
                session.set_speed(*speed);
                None
            }
            Step::Reset => {
                session.reset();
                None
            }
            Step::Close => break,
        };
        produced.extend(stream.take().iter().chain(&snapshot).map(to_value));
    }
    if matches!(fixture.steps.last(), Some(Step::Close)) {
        session.close().unwrap();
        produced.extend(stream.take().iter().map(to_value));
    }
    produced.into_iter().map(normalise).collect()
}

fn to_value(event: &StreamEvent) -> Value {
    serde_json::to_value(event).unwrap()
}

/// Whole numbers compare equal however a fixture writes them.
fn normalise(value: Value) -> Value {
    match value {
        Value::Number(number) => match number.as_f64() {
            Some(float) if float.fract() == 0.0 && float.abs() < 1e15 => json!(float as i64),
            _ => Value::Number(number),
        },
        Value::Array(items) => Value::Array(items.into_iter().map(normalise).collect()),
        Value::Object(fields) => Value::Object(
            fields
                .into_iter()
                .map(|(key, value)| (key, normalise(value)))
                .collect(),
        ),
        other => other,
    }
}

fn first_difference(produced: &[Value], expected: &[Value]) -> Option<String> {
    let at = produced
        .iter()
        .zip(expected)
        .position(|(got, want)| got != want)
        .unwrap_or(produced.len().min(expected.len()));
    if at == produced.len() && at == expected.len() {
        return None;
    }
    let show = |events: &[Value]| {
        events
            .get(at)
            .map_or("(nothing)".to_string(), |event| event.to_string())
    };
    Some(format!(
        "event {at}:\n  expected {}\n  got      {}",
        show(expected),
        show(produced)
    ))
}

#[test]
fn the_session_produces_every_fixture_stream_exactly() {
    let harness = Harness::new();
    let failures: Vec<String> = fixtures()
        .iter()
        .filter_map(|(name, fixture)| {
            let expected: Vec<Value> = fixture.stream.iter().cloned().map(normalise).collect();
            first_difference(&run(&harness, name, fixture), &expected)
                .map(|difference| format!("{name}: {difference}"))
        })
        .collect();
    assert!(failures.is_empty(), "\n{}", failures.join("\n"));
}
