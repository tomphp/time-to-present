use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::mpsc::{Receiver, SyncSender, sync_channel};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;

use super::process::{Abandon, Event, LANGUAGE, Request, Run, read_events, send};
use super::{
    LiveEvent, LiveFeed, LiveModel, LiveReport, LiveRevision, LiveTranscriber, ModelReport,
};
use crate::models::{LIVE_MODEL, ModelManager};

/// 500 ms of 16 kHz 16-bit PCM: the sidecar decodes once per step, so this is what it takes
/// at a time.
const CHUNK_BYTES: usize = 8_000 * 2;

/// How many pushes may wait for a slow sidecar before newer audio is dropped: the Live
/// Transcript is only provisional, and the audio thread must never wait.
const BACKLOG: usize = 256;

/// Runs the Live Transcript through the STT sidecar's live mode, with the live model.
pub struct SidecarLiveTranscriber {
    sidecar: PathBuf,
    models: Arc<ModelManager>,
}

struct SidecarFeed {
    samples: SyncSender<Vec<f32>>,
    _run: Abandon,
}

impl LiveFeed for SidecarFeed {
    fn push(&mut self, samples: &[f32]) {
        let _ = self.samples.try_send(samples.to_vec());
    }
}

impl SidecarLiveTranscriber {
    pub fn new(sidecar: PathBuf, models: Arc<ModelManager>) -> Self {
        Self { sidecar, models }
    }
}

impl LiveTranscriber for SidecarLiveTranscriber {
    fn prepare(&self, mut report: ModelReport) {
        if self.models.is_installed(LIVE_MODEL) {
            return report(LiveModel::Ready);
        }
        let models = self.models.clone();
        std::thread::spawn(move || {
            let fetched = models.ensure(LIVE_MODEL, |progress| {
                report(LiveModel::Fetching {
                    percent: progress.percent(),
                });
            });
            report(match fetched {
                Ok(_) => LiveModel::Ready,
                Err(error) => LiveModel::Failed {
                    reason: error.to_string(),
                },
            });
        });
    }

    fn start(&self, mut report: LiveReport) -> Box<dyn LiveFeed> {
        let run = Arc::new(Run::default());
        let (sender, samples) = sync_channel(BACKLOG);
        let (sidecar, models, worker) = (self.sidecar.clone(), self.models.clone(), run.clone());
        std::thread::spawn(move || {
            let outcome = run_live(&sidecar, &models, samples, &worker, &mut report);
            if let Err(reason) = outcome
                && !worker.is_abandoned()
            {
                report(LiveEvent::Failed(reason));
            }
        });
        Box::new(SidecarFeed {
            samples: sender,
            _run: Abandon(run),
        })
    }
}

fn run_live(
    sidecar: &Path,
    models: &ModelManager,
    samples: Receiver<Vec<f32>>,
    run: &Run,
    report: &mut LiveReport,
) -> Result<(), String> {
    let model = models
        .ensure(LIVE_MODEL, |_| {})
        .map_err(|error| error.to_string())?;
    let (mut stdin, stdout) = run.spawn(sidecar)?;
    send(
        &mut stdin,
        &Request::Live {
            model: &model,
            language: LANGUAGE,
        },
    )?;
    std::thread::spawn(move || stream(stdin, samples));
    let outcome = read_events(BufReader::new(stdout), |event| match event {
        Event::Words {
            from,
            stable,
            words,
        } => {
            report(LiveEvent::Revised(LiveRevision {
                from,
                stable,
                words,
            }));
            true
        }
        Event::Done | Event::NoSpeech => false,
        _ => true,
    });
    run.finish();
    outcome
}

/// Sends the feed on in whole chunks until it ends, then the rest, and closes stdin to end
/// the session.
fn stream(mut stdin: impl Write, samples: Receiver<Vec<f32>>) {
    let mut pcm = Vec::new();
    for received in samples {
        pcm.extend(received.iter().flat_map(|&sample| to_pcm16(sample)));
        while pcm.len() >= CHUNK_BYTES {
            let rest = pcm.split_off(CHUNK_BYTES);
            if send_audio(&mut stdin, &pcm).is_err() {
                return;
            }
            pcm = rest;
        }
    }
    if !pcm.is_empty() {
        let _ = send_audio(&mut stdin, &pcm);
    }
}

fn send_audio(stdin: &mut impl Write, pcm: &[u8]) -> Result<(), String> {
    let pcm = STANDARD.encode(pcm);
    send(&mut *stdin, &Request::Audio { pcm: &pcm })
}

fn to_pcm16(sample: f32) -> [u8; 2] {
    ((sample.clamp(-1.0, 1.0) * f32::from(i16::MAX)).round() as i16).to_le_bytes()
}
