use crate::engine::{Engine, Word, ms_to_samples, samples_to_ms as ms};
use crate::protocol::Event;

const STEP_MS: u64 = 500;
const WINDOW_MS: u64 = 5000;
const SETTLE_MS: u64 = 1000;

/// The live pass: re-decodes a sliding window of the audio heard so far every
/// step, revising the Words it has not settled yet.
pub struct LiveTranscript {
    engine: Box<dyn Engine>,
    window: Vec<f32>,
    window_start: usize,
    undecoded: usize,
    words: Vec<Word>,
    stable: usize,
}

enum Settle {
    Due,
    All,
}

impl LiveTranscript {
    pub fn new(engine: Box<dyn Engine>) -> Self {
        Self {
            engine,
            window: Vec::new(),
            window_start: 0,
            undecoded: 0,
            words: Vec::new(),
            stable: 0,
        }
    }

    pub fn hear(&mut self, samples: &[f32]) -> Result<Option<Event>, String> {
        self.window.extend_from_slice(samples);
        self.undecoded += samples.len();
        if self.undecoded < ms_to_samples(STEP_MS) {
            return Ok(None);
        }
        self.undecoded = 0;
        self.decode(Settle::Due)
    }

    pub fn finish(&mut self) -> Result<Option<Event>, String> {
        if self.undecoded == 0 {
            let unsettled = self.words[self.stable..].to_vec();
            let count = unsettled.len();
            return Ok(self.revise(unsettled, count));
        }
        self.decode(Settle::All)
    }

    pub fn heard_nothing(&self) -> bool {
        self.words.is_empty()
    }

    fn decode(&mut self, settle: Settle) -> Result<Option<Event>, String> {
        let tentative = self.recognise_window()?;
        let full = self.window.len() >= ms_to_samples(WINDOW_MS);
        let settled = match settle {
            Settle::All => tentative.len(),
            Settle::Due if full => {
                let settle_by = ms(self.window_end() - ms_to_samples(SETTLE_MS));
                tentative
                    .iter()
                    .take_while(|word| word.end <= settle_by)
                    .count()
            }
            Settle::Due => 0,
        };
        if full && matches!(settle, Settle::Due) {
            self.slide_past(settled.checked_sub(1).map(|i| tentative[i].end));
        }
        Ok(self.revise(tentative, settled))
    }

    fn recognise_window(&mut self) -> Result<Vec<Word>, String> {
        let offset = ms(self.window_start);
        Ok(self
            .engine
            .recognise(&self.window, &mut |_| {})?
            .into_iter()
            .map(|word| Word {
                start: word.start + offset,
                end: word.end + offset,
                ..word
            })
            .collect())
    }

    /// Starts the window after the last settled Word, or keeps only its last
    /// second when nothing settled.
    fn slide_past(&mut self, settled_end: Option<u64>) {
        let start = settled_end
            .map_or(self.window_end() - ms_to_samples(SETTLE_MS), ms_to_samples)
            .max(self.window_start);
        self.window.drain(..start - self.window_start);
        self.window_start = start;
    }

    fn revise(&mut self, tentative: Vec<Word>, settled: usize) -> Option<Event> {
        let mut words = self.words[..self.stable].to_vec();
        words.extend(tentative);
        let stable = self.stable + settled;
        let from = self
            .words
            .iter()
            .zip(&words)
            .take_while(|(old, new)| old == new)
            .count();
        if words == self.words && stable == self.stable {
            return None;
        }
        let event = Event::Words {
            from,
            stable,
            words: words[from..].to_vec(),
        };
        self.words = words;
        self.stable = stable;
        Some(event)
    }

    fn window_end(&self) -> usize {
        self.window_start + self.window.len()
    }
}
