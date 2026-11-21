use std::collections::HashMap;

use super::{Anchor, EditError, Script, Word};
use crate::time::Ms;

impl Script {
    /// The given Words in Script order, each once.
    pub fn in_script_order(&self, words: &[String]) -> Result<Vec<String>, EditError> {
        if words.is_empty() {
            return Err(EditError::NothingSelected);
        }
        let mut positions = Vec::new();
        for id in words {
            positions.push(self.index_of(id)?);
        }
        positions.sort_unstable();
        positions.dedup();
        Ok(positions
            .iter()
            .map(|&i| self.words[i].id.clone())
            .collect())
    }

    /// Puts transcribed Words in at `index`, in place of the `replaced` Words that start there.
    /// The Word after them keeps its own Gap, and the last new Word takes the last replaced
    /// one's break. Each event on a replaced Word goes to the new Word nearest the same
    /// fraction of the passage, keeping its offset but never sitting before that Word's Gap.
    /// Returns the ids of the events it re-anchored.
    pub fn splice_transcribed(
        &mut self,
        index: usize,
        replaced: &[String],
        mut words: Vec<Word>,
    ) -> Vec<String> {
        let was_replaced = |id: &String| replaced.contains(id);
        let old = fractions(
            self.word_starts()
                .filter(|(word, _)| was_replaced(&word.id)),
        );
        let old: HashMap<String, f64> = old
            .into_iter()
            .map(|(word, fraction)| (word.id.clone(), fraction))
            .collect();
        if let Some((last, replaced_last)) = words.last_mut().zip(self.last_of(replaced)) {
            last.break_after = replaced_last.break_after;
        }
        let new = fractions(passage_starts(&words));
        let nearest = |fraction: f64| {
            let distance = |(_, at): &(&Word, f64)| (at - fraction).abs();
            new.iter()
                .min_by(|a, b| distance(a).total_cmp(&distance(b)))
                .map(|(word, _)| *word)
        };
        let mut moved = Vec::new();
        for event in &mut self.named_events {
            let Anchor::Word(id) = &event.anchor else {
                continue;
            };
            let Some(word) = old.get(id).and_then(|&fraction| nearest(fraction)) else {
                continue;
            };
            event.anchor = Anchor::Word(word.id.clone());
            event.offset = event.offset.max(-word.gap);
            moved.push(event.id.clone());
        }
        self.words.retain(|word| !was_replaced(&word.id));
        self.words.splice(index..index, words);
        moved
    }

    fn last_of(&self, ids: &[String]) -> Option<&Word> {
        self.words.iter().rev().find(|word| ids.contains(&word.id))
    }
}

/// Where each of a passage's Words starts, taking the first to start at 0.
fn passage_starts(words: &[Word]) -> impl Iterator<Item = (&Word, Ms)> {
    words.iter().scan(None, |end: &mut Option<Ms>, word| {
        let start = end.map_or(0, |end| end + word.gap);
        *end = Some(start + word.duration);
        Some((word, start))
    })
}

/// Each Word's start as a fraction of the way from the first Word's start to the last one's end.
fn fractions<'a>(starts: impl Iterator<Item = (&'a Word, Ms)>) -> Vec<(&'a Word, f64)> {
    let starts: Vec<_> = starts.collect();
    let Some(((_, first), (last, last_start))) = starts.first().zip(starts.last()) else {
        return Vec::new();
    };
    let length = (last_start + last.duration - first) as f64;
    starts
        .iter()
        .map(|&(word, start)| {
            let fraction = if length > 0.0 {
                (start - first) as f64 / length
            } else {
                0.0
            };
            (word, fraction)
        })
        .collect()
}
