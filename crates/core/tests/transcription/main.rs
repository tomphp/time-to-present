#[path = "../models/support.rs"]
mod models;

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::mpsc::{Receiver, RecvTimeoutError, channel};
use std::time::Duration;

use models::{FakeSource, manager_with};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tempfile::TempDir;
use ttp_core::models::TRANSCRIPTION_MODEL;
use ttp_core::transcription::{
    HeardWord, SidecarTranscriber, Transcriber, TranscriptionEvent, TranscriptionJob,
};

const WAIT: Duration = Duration::from_secs(5);

/// A sidecar stand-in: a script that saves the request it was sent and prints the given lines.
fn fake_sidecar(dir: &Path, lines: &[&str]) -> PathBuf {
    let path = dir.join("ttp-stt-sidecar");
    let script = format!(
        "#!/bin/sh\nread request\nprintf '%s\\n' \"$request\" > \"{}\"\n{}\n",
        dir.join("request.json").display(),
        lines
            .iter()
            .map(|line| format!("echo '{line}'"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    fs::write(&path, script).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
    path
}

fn request_sent(dir: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(dir.join("request.json")).unwrap()).unwrap()
}

struct Setup {
    dir: TempDir,
    _models_dir: TempDir,
    source: FakeSource,
    transcriber: SidecarTranscriber,
}

fn setup(lines: &[&str]) -> Setup {
    let dir = TempDir::new().unwrap();
    let model = b"a speech model".to_vec();
    let source = FakeSource::serving(&format!("ggml-{TRANSCRIPTION_MODEL}.bin"), model.clone());
    let (models_dir, models) = manager_with(
        &source,
        TRANSCRIPTION_MODEL,
        hex::encode(Sha256::digest(&model)),
    );
    let sidecar = fake_sidecar(dir.path(), lines);
    Setup {
        transcriber: SidecarTranscriber::new(sidecar, Arc::new(models)),
        dir,
        _models_dir: models_dir,
        source,
    }
}

fn start(
    transcriber: &SidecarTranscriber,
    audio: &Path,
) -> (Box<dyn Send>, Receiver<TranscriptionEvent>) {
    let (sender, receiver) = channel();
    let handle = transcriber.transcribe(
        TranscriptionJob {
            audio: audio.to_path_buf(),
            prompt: Some("Hello there.".into()),
        },
        Box::new(move |event| {
            let _ = sender.send(event);
        }),
    );
    (handle, receiver)
}

fn until_done(receiver: &Receiver<TranscriptionEvent>) -> Vec<TranscriptionEvent> {
    let mut events = Vec::new();
    loop {
        let event = receiver.recv_timeout(WAIT).expect("an event");
        let ends = matches!(
            event,
            TranscriptionEvent::Heard(_)
                | TranscriptionEvent::NoSpeech
                | TranscriptionEvent::Failed(_)
        );
        events.push(event);
        if ends {
            return events;
        }
    }
}

#[test]
fn the_model_is_fetched_first_then_the_sidecar_transcribes_the_wav_with_progress_and_words() {
    let setup = setup(&[
        r#"{"type":"ready","protocol":1}"#,
        "",
        r#"{"type":"warmth","degrees":3}"#,
        r#"{"type":"progress","percent":50}"#,
        r#"{"type":"words","from":0,"stable":1,"words":[{"text":"Hi","start":100,"end":400,"confidence":0.8}]}"#,
        r#"{"type":"done"}"#,
    ]);
    let audio = setup.dir.path().join("r1.wav");

    let (_handle, receiver) = start(&setup.transcriber, &audio);
    let events = until_done(&receiver);

    assert!(matches!(events[0], TranscriptionEvent::Model(_)));
    assert_eq!(
        events[events.len() - 2..],
        [
            TranscriptionEvent::Progress(50),
            TranscriptionEvent::Heard(vec![HeardWord {
                text: "Hi".into(),
                start: 100,
                end: 400,
                confidence: 0.8
            }])
        ]
    );
    assert_eq!(setup.source.requests(), 1);
    let request = request_sent(setup.dir.path());
    assert_eq!(request["type"], "transcribe");
    assert_eq!(request["language"], "en");
    assert_eq!(request["path"], audio.to_str().unwrap());
    assert_eq!(request["prompt"], "Hello there.");
    assert!(
        request["model"]
            .as_str()
            .unwrap()
            .ends_with(&format!("ggml-{TRANSCRIPTION_MODEL}.bin"))
    );
}

#[test]
fn no_speech_and_errors_from_the_sidecar_end_the_job() {
    let silent = setup(&[
        r#"{"type":"ready","protocol":1}"#,
        r#"{"type":"no_speech"}"#,
        r#"{"type":"done"}"#,
    ]);
    let (_handle, receiver) = start(&silent.transcriber, Path::new("r1.wav"));
    assert_eq!(
        *until_done(&receiver).last().unwrap(),
        TranscriptionEvent::NoSpeech
    );

    let failing = setup(&[r#"{"type":"error","message":"could not read the recording"}"#]);
    let (_handle, receiver) = start(&failing.transcriber, Path::new("r1.wav"));
    assert_eq!(
        *until_done(&receiver).last().unwrap(),
        TranscriptionEvent::Failed("could not read the recording".into())
    );
}

#[test]
fn a_sidecar_speaking_another_protocol_version_fails_the_job() {
    let newer = setup(&[
        r#"{"type":"ready","protocol":2}"#,
        r#"{"type":"no_speech"}"#,
    ]);
    let (_handle, receiver) = start(&newer.transcriber, Path::new("r1.wav"));
    assert!(matches!(
        until_done(&receiver).last().unwrap(),
        TranscriptionEvent::Failed(reason) if reason.contains("protocol")
    ));
}

#[test]
fn a_sidecar_that_ends_without_a_result_or_cannot_start_fails_the_job() {
    let quiet = setup(&[r#"{"type":"ready","protocol":1}"#]);
    let (_handle, receiver) = start(&quiet.transcriber, Path::new("r1.wav"));
    assert!(matches!(
        until_done(&receiver).last().unwrap(),
        TranscriptionEvent::Failed(_)
    ));

    let missing = setup(&[]);
    fs::remove_file(missing.dir.path().join("ttp-stt-sidecar")).unwrap();
    let (_handle, receiver) = start(&missing.transcriber, Path::new("r1.wav"));
    assert!(matches!(
        until_done(&receiver).last().unwrap(),
        TranscriptionEvent::Failed(_)
    ));
}

#[test]
fn dropping_the_handle_stops_the_sidecar_and_reports_nothing_more() {
    let setup = setup(&[r#"{"type":"ready","protocol":1}"#]);
    let script = setup.dir.path().join("ttp-stt-sidecar");
    let mut slow = fs::read_to_string(&script).unwrap();
    slow.push_str("sleep 30\necho '{\"type\":\"no_speech\"}'\n");
    fs::write(&script, slow).unwrap();
    let (handle, receiver) = start(&setup.transcriber, Path::new("r1.wav"));

    drop(handle);

    let reported: Vec<TranscriptionEvent> =
        std::iter::from_fn(|| receiver.recv_timeout(WAIT).ok()).collect();
    assert!(
        reported
            .iter()
            .all(|event| matches!(event, TranscriptionEvent::Model(_))),
        "{reported:?}"
    );
    assert_eq!(
        receiver.recv_timeout(Duration::ZERO).unwrap_err(),
        RecvTimeoutError::Disconnected
    );
}
