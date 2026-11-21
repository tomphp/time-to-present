use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use super::{HeardWord, Report, RunningJob, Transcriber, TranscriptionEvent, TranscriptionJob};
use crate::models::{ModelManager, TRANSCRIPTION_MODEL};

const LANGUAGE: &str = "en";
const PROTOCOL: u32 = 1;

/// Transcribes through the STT sidecar binary (see `docs/stt-sidecar-protocol.md`), fetching
/// the Transcription model first when it is not installed.
pub struct SidecarTranscriber {
    sidecar: PathBuf,
    models: Arc<ModelManager>,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Request<'a> {
    Transcribe {
        model: &'a Path,
        language: &'a str,
        path: &'a Path,
        #[serde(skip_serializing_if = "Option::is_none")]
        prompt: Option<&'a str>,
    },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    Ready {
        protocol: u32,
    },
    Progress {
        percent: u8,
    },
    Words {
        words: Vec<HeardWord>,
    },
    NoSpeech,
    Error {
        message: String,
    },
    Done,
    #[serde(other)]
    Unknown,
}

/// One sidecar run: abandoning it kills the process, if it has started.
#[derive(Default)]
struct Run {
    abandoned: AtomicBool,
    child: Mutex<Option<Child>>,
}

struct Abandon(Arc<Run>);

impl Drop for Abandon {
    fn drop(&mut self) {
        self.0.abandoned.store(true, Ordering::SeqCst);
        if let Some(child) = self.0.child.lock().unwrap().as_mut() {
            let _ = child.kill();
        }
    }
}

impl SidecarTranscriber {
    pub fn new(sidecar: PathBuf, models: Arc<ModelManager>) -> Self {
        Self { sidecar, models }
    }
}

impl Transcriber for SidecarTranscriber {
    fn transcribe(&self, job: TranscriptionJob, mut report: Report) -> RunningJob {
        let run = Arc::new(Run::default());
        let (sidecar, models, worker) = (self.sidecar.clone(), self.models.clone(), run.clone());
        std::thread::spawn(move || {
            let outcome = run_job(&sidecar, &models, &job, &worker, &mut report);
            if let Err(reason) = outcome
                && !worker.abandoned.load(Ordering::SeqCst)
            {
                report(TranscriptionEvent::Failed(reason));
            }
        });
        Box::new(Abandon(run))
    }
}

fn run_job(
    sidecar: &Path,
    models: &ModelManager,
    job: &TranscriptionJob,
    run: &Run,
    report: &mut Report,
) -> Result<(), String> {
    let model = models
        .ensure(TRANSCRIPTION_MODEL, |progress| {
            report(TranscriptionEvent::Model(progress));
        })
        .map_err(|error| error.to_string())?;
    let (stdin, stdout) = run.spawn(sidecar)?;
    let request = Request::Transcribe {
        model: &model,
        language: LANGUAGE,
        path: &job.audio,
        prompt: job.prompt.as_deref(),
    };
    let outcome = send(stdin, &request).and_then(|()| relay(BufReader::new(stdout), report));
    run.finish();
    outcome
}

impl Run {
    fn spawn(&self, sidecar: &Path) -> Result<(ChildStdin, ChildStdout), String> {
        let mut slot = self.child.lock().unwrap();
        if self.abandoned.load(Ordering::SeqCst) {
            return Err("abandoned".into());
        }
        let mut child = Command::new(sidecar)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|error| format!("could not start the speech sidecar: {error}"))?;
        let pipes = (child.stdin.take().unwrap(), child.stdout.take().unwrap());
        *slot = Some(child);
        Ok(pipes)
    }

    /// Reaps the sidecar once its result is in; it exits by itself after a result.
    fn finish(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn send(mut stdin: impl Write, request: &Request) -> Result<(), String> {
    let line = serde_json::to_string(request).map_err(|error| error.to_string())?;
    writeln!(stdin, "{line}").map_err(|error| format!("could not write to the sidecar: {error}"))
}

fn relay(stdout: impl BufRead, report: &mut Report) -> Result<(), String> {
    for line in stdout.lines() {
        let line = line.map_err(|error| format!("could not read the sidecar: {error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let event: Event = serde_json::from_str(&line)
            .map_err(|error| format!("unexpected sidecar output: {error}"))?;
        match event {
            Event::Ready { protocol } if protocol != PROTOCOL => {
                return Err(format!(
                    "the speech sidecar speaks protocol {protocol}, not {PROTOCOL}"
                ));
            }
            Event::Ready { .. } | Event::Done | Event::Unknown => {}
            Event::Progress { percent } => report(TranscriptionEvent::Progress(percent)),
            Event::Words { words } => {
                report(TranscriptionEvent::Heard(words));
                return Ok(());
            }
            Event::NoSpeech => {
                report(TranscriptionEvent::NoSpeech);
                return Ok(());
            }
            Event::Error { message } => return Err(message),
        }
    }
    Err("the speech sidecar ended without a result".into())
}
