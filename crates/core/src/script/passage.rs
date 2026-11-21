use std::collections::HashMap;

use super::{Anchor, EditError, Ids, NamedEvent, Script, Word};
use crate::time::Ms;

/// The Gap a passage gets when it is added after the last Word.
const APPEND_GAP: Ms = 500;

/// Words taken out of the Script, in Script order, with the Named Events anchored to them.
#[derive(Debug, Clone, PartialEq)]
pub struct Passage {
    words: Vec<Word>,
    events: Vec<NamedEvent>,
}

impl Passage {
    /// Whether `text` reads as this passage's Words, whatever whitespace separates them.
    pub fn reads_as(&self, text: &str) -> bool {
        text.split_whitespace()
            .eq(self.words.iter().map(|word| word.text.as_str()))
    }

    pub fn ids(&self) -> impl Iterator<Item = &String> {
        let words = self.words.iter().map(|word| &word.id);
        words.chain(self.events.iter().map(|event| &event.id))
    }

    pub fn recording_ids(&self) -> impl Iterator<Item = &str> {
        self.words
            .iter()
            .filter_map(|word| word.recording_id.as_deref())
    }

    pub fn event_ids(&self) -> Vec<String> {
        self.events.iter().map(|event| event.id.clone()).collect()
    }

    /// The same passage under newly minted ids, its events anchored to the new Words.
    pub fn renewed(&self, ids: &mut Ids) -> Self {
        let mut renamed = HashMap::new();
        let words = self.words.iter().map(|word| {
            let id = ids.next_word();
            renamed.insert(word.id.clone(), id.clone());
            Word { id, ..word.clone() }
        });
        let words = words.collect();
        let events = self.events.iter().map(|event| NamedEvent {
            id: ids.next_event(),
            anchor: match &event.anchor {
                Anchor::Word(id) => Anchor::Word(renamed[id].clone()),
                Anchor::ScriptStart => Anchor::ScriptStart,
            },
            ..event.clone()
        });
        Self {
            words,
            events: events.collect(),
        }
    }
}

impl Script {
    /// The Gap a passage's first Word gets going in before the Word at `index`: that Word's own,
    /// 500 ms at the end of a non-empty Script, or `when_empty` into an empty one.
    pub(super) fn seam_gap(&self, index: usize, when_empty: Ms) -> Ms {
        match self.words.get(index) {
            Some(next) => next.gap,
            None if self.words.is_empty() => when_empty,
            None => APPEND_GAP,
        }
    }

    /// Whether a Word or Named Event has this id.
    pub fn has(&self, id: &str) -> bool {
        self.words.iter().any(|word| word.id == id)
            || self.named_events.iter().any(|event| event.id == id)
    }

    pub fn copy(&self, words: &[String]) -> Result<Passage, EditError> {
        if words.is_empty() {
            return Err(EditError::NothingSelected);
        }
        for id in words {
            self.index_of(id)?;
        }
        let taken = |id: &String| words.contains(id);
        Ok(Passage {
            words: self
                .words
                .iter()
                .filter(|word| taken(&word.id))
                .cloned()
                .collect(),
            events: self
                .named_events
                .iter()
                .filter(|event| matches!(&event.anchor, Anchor::Word(id) if taken(id)))
                .cloned()
                .collect(),
        })
    }

    /// Takes the Words out with their events, closing up by the Delete rule.
    pub fn cut(&mut self, words: &[String]) -> Result<Passage, EditError> {
        let passage = self.copy(words)?;
        self.named_events
            .retain(|event| !passage.events.iter().any(|cut| cut.id == event.id));
        self.delete_words(words);
        Ok(passage)
    }

    /// Puts a passage in after `after`, or at the start. Its first Word takes the Gap of the
    /// Word it goes before, which keeps its own; at the end it gets 500 ms, and into an empty
    /// Script none. Its first Word's events never sit before the start of that Gap.
    pub fn paste(&mut self, after: Option<&str>, passage: Passage) -> Result<(), EditError> {
        let index = self.index_after(after)?;
        let Passage {
            mut words,
            mut events,
        } = passage;
        let seam_gap = self.seam_gap(index, 0);
        if let Some(first) = words.first_mut() {
            first.gap = seam_gap;
            let anchor = Anchor::Word(first.id.clone());
            for event in events.iter_mut().filter(|event| event.anchor == anchor) {
                event.offset = event.offset.max(-seam_gap);
            }
        }
        self.words.splice(index..index, words);
        self.named_events.extend(events);
        Ok(())
    }
}
