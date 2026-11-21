use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex};

use serde::Serialize;

use crate::capture::Taps;
use crate::transcription::{LiveEvent, LiveFeed, LiveModel, LiveTranscriber};

/// The rough words heard so far in the running Recording, shown where it will land. They are
/// provisional: they never enter the Script.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveTranscript {
    pub after: Option<String>,
    pub before: Option<String>,
    pub words: Vec<String>,
    pub failure: Option<String>,
}

type FeedSlot = Arc<Mutex<Option<Box<dyn LiveFeed>>>>;

/// The live pass over the Recording being made: the capture feed goes to the running live
/// session, and its revisions are collected by `follow`.
pub(super) struct Live {
    transcriber: Arc<dyn LiveTranscriber>,
    feed: FeedSlot,
    models: (Sender<LiveModel>, Receiver<LiveModel>),
    running: Option<Running>,
}

struct Running {
    transcript: LiveTranscript,
    events: Receiver<LiveEvent>,
}

impl Live {
    pub fn new(transcriber: Arc<dyn LiveTranscriber>, taps: &Taps) -> Self {
        let feed = FeedSlot::default();
        let tapped = feed.clone();
        taps.add_feed(move |samples| {
            if let Some(feed) = tapped.lock().unwrap().as_mut() {
                feed.push(samples);
            }
        });
        Self {
            transcriber,
            feed,
            models: channel(),
            running: None,
        }
    }

    pub fn prepare_model(&self) {
        let sender = self.models.0.clone();
        self.transcriber.prepare(Box::new(move |model| {
            let _ = sender.send(model);
        }));
    }

    /// The latest the live model reported since the last call, if anything.
    pub fn model_update(&self) -> Option<LiveModel> {
        self.models.1.try_iter().last()
    }

    pub fn start(&mut self, after: Option<String>, before: Option<String>) {
        let (sender, events) = channel();
        let feed = self.transcriber.start(Box::new(move |event| {
            let _ = sender.send(event);
        }));
        *self.feed.lock().unwrap() = Some(feed);
        self.running = Some(Running {
            transcript: LiveTranscript {
                after,
                before,
                words: Vec::new(),
                failure: None,
            },
            events,
        });
    }

    pub fn stop(&mut self) {
        self.feed.lock().unwrap().take();
        self.running = None;
    }

    /// Applies the revisions reported since the last call, returning whether any came.
    pub fn follow(&mut self) -> bool {
        let Some(running) = &mut self.running else {
            return false;
        };
        let transcript = &mut running.transcript;
        let mut changed = false;
        for event in running.events.try_iter() {
            changed = true;
            match event {
                LiveEvent::Revised(revision) => {
                    transcript.words.truncate(revision.from);
                    transcript
                        .words
                        .extend(revision.words.into_iter().map(|word| word.text));
                }
                LiveEvent::Failed(reason) => transcript.failure = Some(reason),
            }
        }
        changed
    }

    pub fn transcript(&self) -> Option<LiveTranscript> {
        Some(self.running.as_ref()?.transcript.clone())
    }
}
