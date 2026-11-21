use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, Sender, channel};

use super::{Transcriber, TranscriptionEvent, TranscriptionJob};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct JobId(u64);

/// The Transcription queue: one job runs at a time, in the order they were queued. Events are
/// reported from other threads and collected by `drain`.
pub struct Transcriptions {
    transcriber: Arc<dyn Transcriber>,
    next_id: u64,
    waiting: VecDeque<(JobId, TranscriptionJob)>,
    running: Option<(JobId, Box<dyn Send>)>,
    sender: Sender<(JobId, TranscriptionEvent)>,
    receiver: Receiver<(JobId, TranscriptionEvent)>,
}

impl Transcriptions {
    pub fn new(transcriber: Arc<dyn Transcriber>) -> Self {
        let (sender, receiver) = channel();
        Self {
            transcriber,
            next_id: 1,
            waiting: VecDeque::new(),
            running: None,
            sender,
            receiver,
        }
    }

    pub fn enqueue(&mut self, job: TranscriptionJob) -> JobId {
        let id = JobId(self.next_id);
        self.next_id += 1;
        self.waiting.push_back((id, job));
        self.start_next();
        id
    }

    /// Drops a job, wherever it is in the queue. Events it still reports are ignored.
    pub fn abandon(&mut self, id: JobId) {
        self.waiting.retain(|(waiting, _)| *waiting != id);
        if self
            .running
            .as_ref()
            .is_some_and(|(running, _)| *running == id)
        {
            self.running = None;
            self.start_next();
        }
    }

    /// The events reported since the last drain, for jobs still in the queue. A job's last
    /// event ends it and starts the next.
    pub fn drain(&mut self) -> Vec<(JobId, TranscriptionEvent)> {
        let mut events = Vec::new();
        while let Ok((id, event)) = self.receiver.try_recv() {
            if !self
                .running
                .as_ref()
                .is_some_and(|(running, _)| *running == id)
            {
                continue;
            }
            if ends(&event) {
                self.running = None;
                self.start_next();
            }
            events.push((id, event));
        }
        events
    }

    fn start_next(&mut self) {
        if self.running.is_some() {
            return;
        }
        let Some((id, job)) = self.waiting.pop_front() else {
            return;
        };
        let sender = self.sender.clone();
        let handle = self.transcriber.transcribe(
            job,
            Box::new(move |event| {
                let _ = sender.send((id, event));
            }),
        );
        self.running = Some((id, handle));
    }
}

fn ends(event: &TranscriptionEvent) -> bool {
    matches!(
        event,
        TranscriptionEvent::Heard(_) | TranscriptionEvent::NoSpeech | TranscriptionEvent::Failed(_)
    )
}
