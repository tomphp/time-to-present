use std::collections::HashMap;

use super::{Anchor, Script, Word, transform};
use crate::time::Ms;

/// Where the events on a deleted Word land.
enum Landing {
    Before(String),
    EndOf(String),
    ScriptStart,
}

impl Script {
    /// Merges the Word at `index` with the next one; the second Word's events move to the
    /// merged Word at the same Script Time. Returns the ids of the events it re-anchored.
    pub(super) fn merge_at(&mut self, index: usize) -> Vec<String> {
        let second = self.words.remove(index + 1);
        let first = &mut self.words[index];
        let shift = first.duration + second.gap;
        let merged = Anchor::Word(first.id.clone());
        let from = Anchor::Word(second.id.clone());
        transform::merge(first, second);
        let mut moved = Vec::new();
        for event in self.named_events.iter_mut().filter(|e| e.anchor == from) {
            event.anchor = merged.clone();
            event.offset += shift;
            moved.push(event.id.clone());
        }
        moved
    }

    /// Deletes the given Words. An event on a deleted Word keeps its distance before the next
    /// Word, never sitting before the previous Word's end; with no next Word it goes to the
    /// previous Word's end. Returns the ids of the events it re-anchored.
    pub(super) fn delete_words(&mut self, deleted: &[String]) -> Vec<String> {
        let landings = self.landings(deleted);
        let old_starts = self.starts();
        transform::delete(&mut self.words, |word| deleted.contains(&word.id));
        let survivors: HashMap<&str, &Word> =
            self.words.iter().map(|w| (w.id.as_str(), w)).collect();
        let mut moved = Vec::new();
        for event in &mut self.named_events {
            let Anchor::Word(id) = &event.anchor else {
                continue;
            };
            let Some(landing) = landings.get(id) else {
                continue;
            };
            let time = old_starts[id] + event.offset;
            (event.anchor, event.offset) = match landing {
                Landing::Before(next) => {
                    let offset = (time - old_starts[next]).max(-survivors[next.as_str()].gap);
                    (Anchor::Word(next.clone()), offset)
                }
                Landing::EndOf(previous) => (
                    Anchor::Word(previous.clone()),
                    survivors[previous.as_str()].duration,
                ),
                Landing::ScriptStart => (Anchor::ScriptStart, 0),
            };
            moved.push(event.id.clone());
        }
        moved
    }

    fn landings(&self, deleted: &[String]) -> HashMap<String, Landing> {
        let mut landings = HashMap::new();
        let mut run = Vec::new();
        let mut previous = None;
        for word in &self.words {
            if deleted.contains(&word.id) {
                run.push(word.id.clone());
                continue;
            }
            for id in run.drain(..) {
                landings.insert(id, Landing::Before(word.id.clone()));
            }
            previous = Some(word.id.clone());
        }
        for id in run {
            let landing = previous
                .clone()
                .map_or(Landing::ScriptStart, Landing::EndOf);
            landings.insert(id, landing);
        }
        landings
    }

    fn starts(&self) -> HashMap<String, Ms> {
        self.word_starts()
            .map(|(word, start)| (word.id.clone(), start))
            .collect()
    }
}
