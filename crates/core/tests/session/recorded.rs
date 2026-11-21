//! Records a rehearsal through the Session for the webviews' view logic tests to replay, and
//! holds the checked-in recording to what the Session produces now. `TTP_RECORD=1` rewrites it.

use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use ttp_core::clock::StreamEvent;
use ttp_core::session::Session;
use ttp_core::time::Ms;

use crate::support::Harness;

const STEP: Ms = 100;

struct Recorder {
    harness: Harness,
    at: Arc<Mutex<Ms>>,
    stream: Arc<Mutex<Vec<Value>>>,
}

impl Recorder {
    fn record(&self, event: &StreamEvent) {
        let at = *self.at.lock().unwrap();
        self.stream
            .lock()
            .unwrap()
            .push(json!({ "at": at, "event": event }));
    }

    fn advance(&self, session: &mut Session, ms: Ms) {
        for _ in 0..ms / STEP {
            self.harness.advance(STEP);
            *self.at.lock().unwrap() += STEP;
            session.poll().unwrap();
        }
    }
}

fn rehearse() -> Value {
    let (harness, folder) = Harness::with_fixture("rehearsal");
    let mut session = harness.open(&folder);
    let recorder = Arc::new(Recorder {
        harness,
        at: Arc::default(),
        stream: Arc::default(),
    });
    let listener = recorder.clone();
    session.subscribe_stream(move |event| listener.record(event));

    recorder.record(&StreamEvent::Snapshot(session.snapshot()));
    session.play();
    recorder.advance(&mut session, 2_000);
    session.pause();
    recorder.advance(&mut session, 1_000);
    session.play();
    recorder.advance(&mut session, 1_000);
    session.seek(4_750);
    recorder.advance(&mut session, 1_200);

    let mut state = serde_json::to_value(session.state()).unwrap();
    state["folder"] = json!("");
    let stream = recorder.stream.lock().unwrap().clone();
    json!({ "state": state, "stream": stream })
}

#[test]
fn the_recorded_rehearsal_is_what_the_session_produces() {
    let file = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../apps/desktop/fixtures/recorded-rehearsal.json");
    let produced = rehearse();
    if std::env::var_os("TTP_RECORD").is_some() {
        fs::write(
            &file,
            serde_json::to_string_pretty(&produced).unwrap() + "\n",
        )
        .unwrap();
    }
    let recorded: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(produced, recorded);
}
