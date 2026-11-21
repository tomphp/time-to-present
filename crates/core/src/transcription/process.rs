use std::io::{BufRead, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use super::HeardWord;

pub const LANGUAGE: &str = "en";
const PROTOCOL: u32 = 1;

/// The requests of the STT sidecar protocol (see `docs/stt-sidecar-protocol.md`).
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Request<'a> {
    Transcribe {
        model: &'a Path,
        language: &'a str,
        path: &'a Path,
        #[serde(skip_serializing_if = "Option::is_none")]
        prompt: Option<&'a str>,
    },
    Live {
        model: &'a Path,
        language: &'a str,
    },
    Audio {
        pcm: &'a str,
    },
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    Ready {
        protocol: u32,
    },
    Progress {
        percent: u8,
    },
    Words {
        from: usize,
        stable: usize,
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

/// One sidecar process: abandoning it kills the process, if it has started.
#[derive(Default)]
pub struct Run {
    abandoned: AtomicBool,
    child: Mutex<Option<Child>>,
}

pub struct Abandon(pub Arc<Run>);

impl Drop for Abandon {
    fn drop(&mut self) {
        self.0.abandoned.store(true, Ordering::SeqCst);
        if let Some(child) = self.0.child.lock().unwrap().as_mut() {
            let _ = child.kill();
        }
    }
}

impl Run {
    pub fn is_abandoned(&self) -> bool {
        self.abandoned.load(Ordering::SeqCst)
    }

    pub fn spawn(&self, sidecar: &Path) -> Result<(ChildStdin, ChildStdout), String> {
        let mut slot = self.child.lock().unwrap();
        if self.is_abandoned() {
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
    pub fn finish(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub fn send(mut stdin: impl Write, request: &Request) -> Result<(), String> {
    let line = serde_json::to_string(request).map_err(|error| error.to_string())?;
    writeln!(stdin, "{line}").map_err(|error| format!("could not write to the sidecar: {error}"))
}

/// Hands each of the sidecar's events to `on_event` until it returns false, failing on an
/// `error`, a sidecar speaking another protocol, or output that ends without a result.
pub fn read_events(
    stdout: impl BufRead,
    mut on_event: impl FnMut(Event) -> bool,
) -> Result<(), String> {
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
            Event::Error { message } => return Err(message),
            event => {
                if !on_event(event) {
                    return Ok(());
                }
            }
        }
    }
    Err("the speech sidecar ended without a result".into())
}
