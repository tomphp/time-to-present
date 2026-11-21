use std::path::Path;

use crate::engine::{Engine, Loader, Mode, SAMPLE_RATE, Word, samples_to_ms as ms};

const SHORTEST_WORD: usize = SAMPLE_RATE / 200;

/// A protocol-level stand-in for a speech model: each run of one non-zero
/// sample value lasting at least 5 ms is heard as the Word `w<value>`, and
/// zero is silence. A negative value makes it fail.
pub struct FakeLoader;

impl Loader for FakeLoader {
    fn load(&self, model: &Path, _language: &str, _mode: Mode) -> Result<Box<dyn Engine>, String> {
        std::fs::metadata(model).map_err(|e| e.to_string())?;
        Ok(Box::new(FakeEngine))
    }
}

struct FakeEngine;

impl Engine for FakeEngine {
    fn recognise(
        &mut self,
        audio: &[f32],
        progress: &mut dyn FnMut(u8),
    ) -> Result<Vec<Word>, String> {
        let runs = runs(audio);
        if runs.iter().any(|run| run.value < 0) {
            return Err("the fake engine was told to fail".into());
        }
        let words: Vec<Word> = runs
            .into_iter()
            .filter(|run| run.value != 0 && run.end - run.start >= SHORTEST_WORD)
            .map(|run| Word {
                text: format!("w{}", run.value),
                start: ms(run.start),
                end: ms(run.end),
                confidence: 1.0,
            })
            .collect();
        for word in &words {
            progress((word.end * 100 / ms(audio.len())) as u8);
        }
        Ok(words)
    }
}

struct Run {
    value: i32,
    start: usize,
    end: usize,
}

fn runs(audio: &[f32]) -> Vec<Run> {
    let mut runs: Vec<Run> = Vec::new();
    for (i, sample) in audio.iter().enumerate() {
        let value = (sample * 32768.0).round() as i32;
        match runs.last_mut() {
            Some(run) if run.value == value => run.end = i + 1,
            _ => runs.push(Run {
                value,
                start: i,
                end: i + 1,
            }),
        }
    }
    runs
}
