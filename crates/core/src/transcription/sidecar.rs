use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use super::process::{Abandon, Event, LANGUAGE, Request, Run, read_events, send};
use super::{Report, RunningJob, Transcriber, TranscriptionEvent, TranscriptionJob};
use crate::models::{ModelManager, TRANSCRIPTION_MODEL};

/// Transcribes through the STT sidecar binary (see `docs/stt-sidecar-protocol.md`), fetching
/// the Transcription model first when it is not installed.
pub struct SidecarTranscriber {
    sidecar: PathBuf,
    models: Arc<ModelManager>,
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
                && !worker.is_abandoned()
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
    let outcome = send(stdin, &request)
        .and_then(|()| read_events(BufReader::new(stdout), |event| relay(event, report)));
    run.finish();
    outcome
}

/// Reports one event, returning whether more are to come.
fn relay(event: Event, report: &mut Report) -> bool {
    match event {
        Event::Progress { percent } => report(TranscriptionEvent::Progress(percent)),
        Event::Words { words, .. } => {
            report(TranscriptionEvent::Heard(words));
            return false;
        }
        Event::NoSpeech => {
            report(TranscriptionEvent::NoSpeech);
            return false;
        }
        _ => {}
    }
    true
}
