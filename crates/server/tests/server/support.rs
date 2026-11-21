use std::fs;
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicI64, Ordering};

use serde_json::Value;
use tempfile::TempDir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use ttp_core::capture::{Access, AudioCallback, AudioSource, CaptureError, Input};
use ttp_core::platform::{AppNap, Platform};
use ttp_core::session::Session;
use ttp_core::settings::ServerSettings;
use ttp_core::time::{Ms, TimeSource};
use ttp_core::transcription::{
    LiveFeed, LiveReport, LiveTranscriber, ModelReport, Report, RunningJob, Transcriber,
    TranscriptionJob,
};
use ttp_server::{Server, SharedSession};

use crate::sse::{Events, PATIENCE};

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

struct NeverHearsLive;

impl LiveTranscriber for NeverHearsLive {
    fn prepare(&self, _: ModelReport) {
        unreachable!("the server never records")
    }

    fn start(&self, _: LiveReport) -> Box<dyn LiveFeed> {
        unreachable!("the server never records")
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
            live: Arc::new(NeverHearsLive),
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

    /// The status of a GET sent exactly as written, where an HTTP client would tidy the path.
    pub async fn raw_status(&self, path: &str) -> u16 {
        let mut connection = TcpStream::connect(self.server.address()).await.unwrap();
        let request =
            format!("GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
        connection.write_all(request.as_bytes()).await.unwrap();
        let mut response = String::new();
        connection.read_to_string(&mut response).await.unwrap();
        response[9..12].parse().unwrap()
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
