use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use tempfile::TempDir;
use ttp_core::capture::{Access, AudioCallback, AudioSource, CaptureError, Input};
use ttp_core::platform::{AppNap, Platform};
use ttp_core::session::{Session, SessionState};
use ttp_core::store::StoreError;
use ttp_core::time::{Ms, TimeSource};
use ttp_core::transcription::{
    HeardWord, Report, Transcriber, TranscriptionEvent, TranscriptionJob,
};

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

/// A Transcriber the test drives: it holds each job's reporter so the test can send progress,
/// Words, silence or a failure whenever it likes.
#[derive(Default)]
pub struct FakeTranscriber {
    jobs: Mutex<Vec<TranscriptionJob>>,
    running: Arc<Mutex<Option<(usize, Report)>>>,
}

struct AbandonOnDrop {
    job: usize,
    running: Arc<Mutex<Option<(usize, Report)>>>,
}

impl Drop for AbandonOnDrop {
    fn drop(&mut self) {
        let mut running = self.running.lock().unwrap();
        if running.as_ref().is_some_and(|(job, _)| *job == self.job) {
            *running = None;
        }
    }
}

impl FakeTranscriber {
    pub fn jobs(&self) -> Vec<TranscriptionJob> {
        self.jobs.lock().unwrap().clone()
    }

    pub fn audio_files(&self) -> Vec<String> {
        self.jobs()
            .iter()
            .map(|job| {
                job.audio
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect()
    }

    pub fn is_running(&self) -> bool {
        self.running.lock().unwrap().is_some()
    }

    pub fn report(&self, event: TranscriptionEvent) {
        let mut running = self.running.lock().unwrap();
        let (_, report) = running.as_mut().expect("no Transcription is running");
        report(event);
    }

    pub fn progress(&self, percent: u8) {
        self.report(TranscriptionEvent::Progress(percent));
    }

    pub fn hear(&self, words: &[(&str, Ms, Ms)]) {
        self.report(TranscriptionEvent::Heard(heard(words)));
    }

    pub fn fail(&self, reason: &str) {
        self.report(TranscriptionEvent::Failed(reason.into()));
    }

    pub fn no_speech(&self) {
        self.report(TranscriptionEvent::NoSpeech);
    }
}

pub fn heard(words: &[(&str, Ms, Ms)]) -> Vec<HeardWord> {
    words
        .iter()
        .map(|&(text, start, end)| HeardWord {
            text: text.into(),
            start,
            end,
            confidence: 0.9,
        })
        .collect()
}

impl Transcriber for FakeTranscriber {
    fn transcribe(&self, job: TranscriptionJob, report: Report) -> Box<dyn Send> {
        let mut jobs = self.jobs.lock().unwrap();
        jobs.push(job);
        let job = jobs.len();
        *self.running.lock().unwrap() = Some((job, report));
        Box::new(AbandonOnDrop {
            job,
            running: self.running.clone(),
        })
    }
}

pub struct Harness {
    temp: TempDir,
    time: Arc<ManualTime>,
    pub audio: Arc<FakeAudio>,
    pub app_nap: Arc<FakeAppNap>,
    pub transcriber: Arc<FakeTranscriber>,
}

impl Harness {
    pub fn new() -> Self {
        Self {
            temp: TempDir::new().unwrap(),
            time: Arc::new(ManualTime(AtomicI64::new(0))),
            audio: Arc::new(FakeAudio::new()),
            app_nap: Arc::default(),
            transcriber: Arc::default(),
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
            transcriber: self.transcriber.clone(),
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
