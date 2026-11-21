use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use tempfile::TempDir;
use ttp_core::capture::{Access, AudioCallback, AudioSource, CaptureError, Input};
use ttp_core::platform::{AppNap, Platform};
use ttp_core::session::{Session, SessionState};
use ttp_core::store::StoreError;
use ttp_core::time::{Ms, TimeSource};

pub const BUILT_IN: &str = "MacBook Pro Microphone";
pub const INTERFACE: &str = "MOTU M2";

pub struct ManualTime(AtomicI64);

impl TimeSource for ManualTime {
    fn now(&self) -> Ms {
        self.0.load(Ordering::SeqCst)
    }
}

type OpenInput = Arc<Mutex<Option<(String, AudioCallback)>>>;

/// Two inputs, the built-in one the system default, that play whatever PCM a test hands them.
pub struct FakeAudio {
    access: Mutex<Access>,
    inputs: Mutex<Vec<Input>>,
    open: OpenInput,
}

struct CloseOnDrop(OpenInput);

impl Drop for CloseOnDrop {
    fn drop(&mut self) {
        *self.0.lock().unwrap() = None;
    }
}

impl FakeAudio {
    fn new() -> Self {
        Self {
            access: Mutex::new(Access::Granted),
            inputs: Mutex::new(vec![
                Input {
                    name: BUILT_IN.into(),
                    channels: 1,
                    sample_rate: 48_000,
                },
                Input {
                    name: INTERFACE.into(),
                    channels: 2,
                    sample_rate: 44_100,
                },
            ]),
            open: OpenInput::default(),
        }
    }

    pub fn deny_access(&self) {
        *self.access.lock().unwrap() = Access::Denied;
    }

    pub fn unplug(&self, name: &str) {
        self.inputs
            .lock()
            .unwrap()
            .retain(|input| input.name != name);
    }

    pub fn opened(&self) -> Option<String> {
        self.open
            .lock()
            .unwrap()
            .as_ref()
            .map(|(name, _)| name.clone())
    }

    pub fn play(&self, interleaved: &[f32]) {
        let mut open = self.open.lock().unwrap();
        let (_, on_audio) = open.as_mut().expect("no input is open");
        on_audio(interleaved);
    }
}

impl AudioSource for FakeAudio {
    fn request_access(&self) -> Access {
        *self.access.lock().unwrap()
    }

    fn inputs(&self) -> Vec<Input> {
        self.inputs.lock().unwrap().clone()
    }

    fn default_input(&self) -> Option<String> {
        Some(BUILT_IN.into())
    }

    fn open(&self, input: &Input, on_audio: AudioCallback) -> Result<Box<dyn Send>, CaptureError> {
        *self.open.lock().unwrap() = Some((input.name.clone(), on_audio));
        Ok(Box::new(CloseOnDrop(self.open.clone())))
    }
}

#[derive(Default)]
pub struct FakeAppNap {
    held: Arc<AtomicUsize>,
}

struct Assertion(Arc<AtomicUsize>);

impl Drop for Assertion {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

impl FakeAppNap {
    pub fn held(&self) -> bool {
        self.held.load(Ordering::SeqCst) > 0
    }
}

impl AppNap for FakeAppNap {
    fn hold_off(&self, _reason: &str) -> Box<dyn Send> {
        self.held.fetch_add(1, Ordering::SeqCst);
        Box::new(Assertion(self.held.clone()))
    }
}

pub struct Harness {
    temp: TempDir,
    time: Arc<ManualTime>,
    pub audio: Arc<FakeAudio>,
    pub app_nap: Arc<FakeAppNap>,
}

impl Harness {
    pub fn new() -> Self {
        Self {
            temp: TempDir::new().unwrap(),
            time: Arc::new(ManualTime(AtomicI64::new(0))),
            audio: Arc::new(FakeAudio::new()),
            app_nap: Arc::default(),
        }
    }

    pub fn advance(&self, ms: Ms) {
        self.time.0.fetch_add(ms, Ordering::SeqCst);
    }

    pub fn parent(&self) -> &Path {
        self.temp.path()
    }

    pub fn with_fixture(name: &str) -> (Self, PathBuf) {
        let harness = Self::new();
        let folder = harness.parent().join(name);
        std::fs::create_dir(&folder).unwrap();
        let source = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name);
        for entry in std::fs::read_dir(source).unwrap() {
            let entry = entry.unwrap();
            std::fs::copy(entry.path(), folder.join(entry.file_name())).unwrap();
        }
        (harness, folder)
    }

    pub fn platform(&self) -> Platform {
        Platform {
            time: self.time.clone(),
            audio: self.audio.clone(),
            app_nap: self.app_nap.clone(),
        }
    }

    pub fn create(&self, title: &str) -> Session {
        Session::create(self.parent(), title, self.platform()).unwrap()
    }

    pub fn create_error(&self, title: &str) -> StoreError {
        Session::create(self.parent(), title, self.platform())
            .err()
            .unwrap()
    }

    pub fn open(&self, folder: &Path) -> Session {
        Session::open(folder, self.platform()).unwrap()
    }

    pub fn open_error(&self, folder: &Path) -> StoreError {
        Session::open(folder, self.platform()).err().unwrap()
    }
}

pub fn starts(state: &SessionState) -> Vec<(&str, Ms)> {
    word_starts(state)
        .into_iter()
        .map(|(_, text, start)| (text, start))
        .collect()
}

pub fn word_starts(state: &SessionState) -> Vec<(&str, &str, Ms)> {
    state
        .words
        .iter()
        .map(|w| (w.word.id.as_str(), w.word.text.as_str(), w.start))
        .collect()
}
