use std::fs;
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Duration;

use futures_util::StreamExt;
use futures_util::stream::BoxStream;
use serde_json::Value;
use tempfile::TempDir;
use ttp_core::capture::{Access, AudioCallback, AudioSource, CaptureError, Input};
use ttp_core::platform::{AppNap, Platform};
use ttp_core::session::Session;
use ttp_core::settings::ServerSettings;
use ttp_core::time::{Ms, TimeSource};
use ttp_core::transcription::{Report, RunningJob, Transcriber, TranscriptionJob};
use ttp_server::{Server, SharedSession};

const PATIENCE: Duration = Duration::from_secs(5);

struct ManualTime(AtomicI64);

impl TimeSource for ManualTime {
    fn now(&self) -> Ms {
        self.0.load(Ordering::SeqCst)
    }
}

struct NoAudio;

impl AudioSource for NoAudio {
    fn request_access(&self) -> Access {
        Access::Denied
    }

    fn inputs(&self) -> Vec<Input> {
        Vec::new()
    }

    fn default_input(&self) -> Option<String> {
        None
    }

    fn open(&self, _: &Input, _: AudioCallback) -> Result<Box<dyn Send>, CaptureError> {
        unreachable!("the server never records")
    }
}

struct AwakeAnyway;

impl AppNap for AwakeAnyway {
    fn hold_off(&self, _reason: &str) -> Box<dyn Send> {
        Box::new(())
    }
}

struct NeverTranscribes;

impl Transcriber for NeverTranscribes {
    fn transcribe(&self, _: TranscriptionJob, _: Report) -> RunningJob {
        unreachable!("the server never transcribes")
    }
}

pub fn loopback(port: u16) -> ServerSettings {
    ServerSettings {
        address: Ipv4Addr::LOCALHOST.into(),
        port,
    }
}

/// A server on an ephemeral loopback port over the same shared Session the desktop app holds.
pub struct Harness {
    temp: TempDir,
    time: Arc<ManualTime>,
    session: SharedSession,
    pub server: Server,
}

impl Harness {
    pub async fn start() -> Self {
        let session = SharedSession::default();
        Self {
            temp: TempDir::new().unwrap(),
            time: Arc::new(ManualTime(AtomicI64::new(0))),
            server: Server::start(loopback(0), session.clone()).await.unwrap(),
            session,
        }
    }

    fn platform(&self) -> Platform {
        Platform {
            time: self.time.clone(),
            audio: Arc::new(NoAudio),
            app_nap: Arc::new(AwakeAnyway),
            transcriber: Arc::new(NeverTranscribes),
        }
    }

    /// Opens the Presentation in `name`, with these Words and Named Events.
    pub fn open(&self, name: &str, words: Value, named_events: Value) -> PathBuf {
        let folder = self.temp.path().join(name);
        fs::create_dir_all(&folder).unwrap();
        let presentation = serde_json::json!({
            "formatVersion": 1,
            "title": name,
            "recordings": [],
            "words": words,
            "namedEvents": named_events,
        });
        fs::write(folder.join("presentation.json"), presentation.to_string()).unwrap();
        let session = Session::open(&folder, self.platform()).unwrap();
        self.server.open(session).unwrap();
        folder
    }

    pub fn open_hello(&self) -> PathBuf {
        self.open("hello", hello_words(), hello_events())
    }

    pub fn close(&self) {
        self.server.close().unwrap();
    }

    pub fn advance(&self, ms: Ms) {
        self.time.0.fetch_add(ms, Ordering::SeqCst);
    }

    pub fn with_session<T>(&self, command: impl FnOnce(&mut Session) -> T) -> T {
        command(self.session.lock().unwrap().as_mut().unwrap())
    }

    pub fn url(&self, path: &str) -> String {
        format!("http://{}{path}", self.server.address())
    }

    pub async fn get(&self, path: &str) -> reqwest::Response {
        reqwest::get(self.url(path)).await.unwrap()
    }

    pub async fn connect(&self) -> Events {
        Events::connect(&self.url("/_ttp/v1/events")).await
    }

    /// Waits for the connected-app count, as connections come and go on their own time.
    pub async fn until_connected_apps(&self, count: usize) {
        let mut watched = self.server.watch_connected_apps();
        tokio::time::timeout(PATIENCE, watched.wait_for(|connected| *connected == count))
            .await
            .unwrap_or_else(|_| panic!("the connected-app count never reached {count}"))
            .unwrap();
    }
}

pub fn write(folder: &Path, file: &str, contents: &str) {
    let path = folder.join(file);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, contents).unwrap();
}

pub fn hello_words() -> Value {
    serde_json::json!([
        {"id": "w1", "text": "Hello,", "gap": 400, "duration": 300, "recordingId": null, "audioStart": null, "audioEnd": null, "confidence": null},
        {"id": "w2", "text": "world.", "gap": 150, "duration": 450, "recordingId": null, "audioStart": null, "audioEnd": null, "confidence": null, "breakAfter": "paragraph"},
    ])
}

pub fn hello_events() -> Value {
    serde_json::json!([
        {"id": "e1", "name": "slide", "data": {"index": 1}, "anchor": "scriptStart", "offset": 0},
        {"id": "e2", "name": "confetti", "anchor": "w2", "offset": 100},
    ])
}

/// One SSE message as it came over the wire.
#[derive(Debug, Clone, PartialEq)]
pub struct Message {
    pub event: String,
    pub id: Option<u64>,
    pub retry: Option<u64>,
    pub data: Value,
}

/// An SSE connection read message by message.
pub struct Events {
    pub status: reqwest::StatusCode,
    body: BoxStream<'static, reqwest::Result<bytes::Bytes>>,
    buffered: String,
}

impl Events {
    pub async fn connect(url: &str) -> Self {
        let response = reqwest::get(url).await.unwrap();
        Self {
            status: response.status(),
            body: response.bytes_stream().boxed(),
            buffered: String::new(),
        }
    }

    /// The next message, skipping keep-alive comments, or None once the stream has ended.
    pub async fn next(&mut self) -> Option<Message> {
        loop {
            if let Some(end) = self.buffered.find("\n\n") {
                let block: String = self.buffered.drain(..end + 2).collect();
                if let Some(message) = parse(&block) {
                    return Some(message);
                }
                continue;
            }
            let chunk = tokio::time::timeout(PATIENCE, self.body.next())
                .await
                .expect("the stream went quiet");
            match chunk {
                Some(bytes) => self
                    .buffered
                    .push_str(&String::from_utf8_lossy(&bytes.unwrap())),
                None => return None,
            }
        }
    }

    pub async fn expect(&mut self) -> Message {
        self.next().await.expect("the stream ended")
    }

    pub async fn expect_end(&mut self) {
        if let Some(message) = self.next().await {
            panic!("expected the stream to end, got {message:?}");
        }
    }
}

fn parse(block: &str) -> Option<Message> {
    let mut message = Message {
        event: "message".into(),
        id: None,
        retry: None,
        data: Value::Null,
    };
    let mut data = None;
    for line in block.lines() {
        let Some((field, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.strip_prefix(' ').unwrap_or(value);
        match field {
            "event" => message.event = value.into(),
            "id" => message.id = Some(value.parse().unwrap()),
            "retry" => message.retry = Some(value.parse().unwrap()),
            "data" => data = Some(serde_json::from_str(value).unwrap()),
            _ => {}
        }
    }
    message.data = data?;
    Some(message)
}
