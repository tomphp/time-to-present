use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, RecvTimeoutError, channel};
use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tempfile::TempDir;
use ttp_core::models::LIVE_MODEL;
use ttp_core::transcription::{
    HeardWord, LiveEvent, LiveFeed, LiveModel, LiveRevision, LiveTranscriber,
    SidecarLiveTranscriber,
};

use crate::models::{FakeSource, manager_with};

const WAIT: Duration = Duration::from_secs(5);
const READY: &str = r#"{"type":"ready","protocol":1}"#;
const HEARD_HI: &str = r#"{"type":"words","from":0,"stable":0,"words":[{"text":"Hi","start":100,"end":400,"confidence":0.8}]}"#;

/// A live sidecar stand-in: it saves its first request and every audio request after it,
/// answers `ready` and then `reply` to each audio request.
fn live_sidecar(dir: &Path, ready: &str, reply: &str) -> std::path::PathBuf {
    let path = dir.join("ttp-stt-sidecar");
    let (request, audio) = (dir.join("request.json"), dir.join("audio.jsonl"));
    let script = format!(
        "#!/bin/sh\nread request\nprintf '%s\\n' \"$request\" > \"{}\"\necho '{ready}'\n\
         while read line; do\nprintf '%s\\n' \"$line\" >> \"{}\"\necho '{reply}'\ndone\n",
        request.display(),
        audio.display()
    );
    fs::write(&path, script).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
    path
}

struct Setup {
    dir: TempDir,
    _models_dir: TempDir,
    source: FakeSource,
    live: SidecarLiveTranscriber,
}

fn setup(ready: &str, reply: &str) -> Setup {
    let dir = TempDir::new().unwrap();
    let model = b"a live speech model".to_vec();
    let source = FakeSource::serving(&format!("ggml-{LIVE_MODEL}.bin"), model.clone());
    let (models_dir, models) =
        manager_with(&source, LIVE_MODEL, hex::encode(Sha256::digest(&model)));
    Setup {
        live: SidecarLiveTranscriber::new(live_sidecar(dir.path(), ready, reply), Arc::new(models)),
        dir,
        _models_dir: models_dir,
        source,
    }
}

fn prepare(live: &SidecarLiveTranscriber) -> Vec<LiveModel> {
    let (sender, receiver) = channel();
    live.prepare(Box::new(move |model| {
        let _ = sender.send(model);
    }));
    let mut reported = Vec::new();
    loop {
        let model = receiver.recv_timeout(WAIT).expect("a live model report");
        let settled = !matches!(model, LiveModel::Fetching { .. });
        reported.push(model);
        if settled {
            return reported;
        }
    }
}

fn start(live: &SidecarLiveTranscriber) -> (Box<dyn LiveFeed>, Receiver<LiveEvent>) {
    let (sender, receiver) = channel();
    let feed = live.start(Box::new(move |event| {
        let _ = sender.send(event);
    }));
    (feed, receiver)
}

#[test]
fn preparing_fetches_the_live_model_once_then_reports_it_ready_at_once() {
    let setup = setup(READY, HEARD_HI);

    let fetched = prepare(&setup.live);
    assert!(matches!(fetched[0], LiveModel::Fetching { .. }));
    assert_eq!(*fetched.last().unwrap(), LiveModel::Ready);

    assert_eq!(prepare(&setup.live), [LiveModel::Ready]);
    assert_eq!(setup.source.requests(), 1);
}

#[test]
fn a_live_model_that_cannot_be_fetched_is_reported_failed() {
    let setup = setup(READY, HEARD_HI);
    let (_dir, missing) = manager_with(&setup.source, "nowhere", "0".repeat(64));
    let live = SidecarLiveTranscriber::new(setup.dir.path().join("x"), Arc::new(missing));

    assert!(matches!(
        prepare(&live).last().unwrap(),
        LiveModel::Failed { .. }
    ));
}

fn sent_samples(dir: &Path) -> Vec<Vec<i16>> {
    let audio = fs::read_to_string(dir.join("audio.jsonl")).unwrap_or_default();
    audio
        .lines()
        .map(|line| {
            let request: Value = serde_json::from_str(line).unwrap();
            assert_eq!(request["type"], "audio");
            let bytes = STANDARD.decode(request["pcm"].as_str().unwrap()).unwrap();
            let (pairs, _) = bytes.as_chunks::<2>();
            pairs.iter().map(|&pair| i16::from_le_bytes(pair)).collect()
        })
        .collect()
}

#[test]
fn the_feed_streams_500_ms_chunks_of_16_bit_pcm_into_a_live_session_and_relays_its_revisions() {
    let setup = setup(READY, HEARD_HI);
    prepare(&setup.live);
    let (mut feed, events) = start(&setup.live);

    let mut samples = vec![0.25; 8_000];
    samples.extend([0.5, -1.0, 2.0]);
    samples.extend(vec![0.0; 7_997]);
    samples.extend(vec![0.1; 100]);
    for chunk in samples.chunks(3_000) {
        feed.push(chunk);
    }

    let revision = LiveEvent::Revised(LiveRevision {
        from: 0,
        stable: 0,
        words: vec![HeardWord {
            text: "Hi".into(),
            start: 100,
            end: 400,
            confidence: 0.8,
        }],
    });
    assert_eq!(events.recv_timeout(WAIT).unwrap(), revision);
    assert_eq!(events.recv_timeout(WAIT).unwrap(), revision);
    let request: Value =
        serde_json::from_str(&fs::read_to_string(setup.dir.path().join("request.json")).unwrap())
            .unwrap();
    assert_eq!(request["type"], "live");
    assert_eq!(request["language"], "en");
    assert!(
        request["model"]
            .as_str()
            .unwrap()
            .ends_with(&format!("ggml-{LIVE_MODEL}.bin"))
    );
    let sent = sent_samples(setup.dir.path());
    assert_eq!(sent.len(), 2);
    assert_eq!(sent[0], vec![8_192; 8_000]);
    assert_eq!(sent[1][..4], [16_384, -32_767, 32_767, 0]);
    assert_eq!(sent[1].len(), 8_000);
}

#[test]
fn a_sidecar_error_or_another_protocol_fails_the_live_session() {
    let failing = setup(
        r#"{"type":"error","message":"the model would not load"}"#,
        HEARD_HI,
    );
    prepare(&failing.live);
    let (_feed, events) = start(&failing.live);
    assert_eq!(
        events.recv_timeout(WAIT).unwrap(),
        LiveEvent::Failed("the model would not load".into())
    );

    let newer = setup(r#"{"type":"ready","protocol":2}"#, HEARD_HI);
    prepare(&newer.live);
    let (_feed, events) = start(&newer.live);
    assert!(matches!(
        events.recv_timeout(WAIT).unwrap(),
        LiveEvent::Failed(reason) if reason.contains("protocol")
    ));
}

#[test]
fn dropping_the_feed_ends_the_session_and_reports_nothing_more() {
    let setup = setup(READY, HEARD_HI);
    prepare(&setup.live);
    let (feed, events) = start(&setup.live);

    drop(feed);

    assert_eq!(
        events.recv_timeout(WAIT),
        Err(RecvTimeoutError::Disconnected)
    );
}
