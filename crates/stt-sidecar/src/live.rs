use crate::engine::{Engine, SAMPLE_RATE, Word};
use crate::protocol::Event;

const STEP_MS: usize = 500;
const WINDOW_MS: usize = 5000;
const SETTLE_MS: usize = 1000;

/// The live pass: re-decodes a sliding window of the audio heard so far every
/// step, revising the Words it has not settled yet.
pub struct Live {
    engine: Box<dyn Engine>,
    window: Vec<f32>,
    window_start: usize,
    undecoded: usize,
    words: Vec<Word>,
    stable: usize,
}

impl Live {
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
        if self.undecoded < samples_in(STEP_MS) {
            return Ok(None);
        }
        self.undecoded = 0;
        self.decode(false)
    }

    pub fn finish(&mut self) -> Result<Option<Event>, String> {
        self.decode(true)
    }

    pub fn heard_nothing(&self) -> bool {
        self.words.is_empty()
    }

    fn decode(&mut self, last: bool) -> Result<Option<Event>, String> {
        let tentative = self.hear_window()?;
        let full = self.window.len() >= samples_in(WINDOW_MS);
        let settled = if last {
            tentative.len()
        } else if full {
            let settle_by = ms(self.window_end() - samples_in(SETTLE_MS));
            tentative
                .iter()
                .take_while(|word| word.end <= settle_by)
                .count()
        } else {
            0
        };
        if full && !last {
            self.slide_past(settled.checked_sub(1).map(|i| tentative[i].end));
        }
        Ok(self.revise(tentative, settled))
    }

    fn hear_window(&mut self) -> Result<Vec<Word>, String> {
        let offset = ms(self.window_start);
        Ok(self
            .engine
            .transcribe(&self.window, &mut |_| {})?
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
            .map_or(self.window_end() - samples_in(SETTLE_MS), |end| {
                samples_in(end as usize)
            })
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

fn samples_in(ms: usize) -> usize {
    ms * SAMPLE_RATE / 1000
}

fn ms(samples: usize) -> u64 {
    (samples * 1000 / SAMPLE_RATE) as u64
}
