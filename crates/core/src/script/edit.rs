use serde::Deserialize;

use super::{BreakAfter, Ids, Script, Word};
use super::{estimate, transform};

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Edit {
    Correct {
        word: String,
        text: String,
    },
    Split {
        word: String,
        at: usize,
    },
    Merge {
        word: String,
    },
    Delete {
        words: Vec<String>,
    },
    SetBreak {
        word: String,
        break_after: Option<BreakAfter>,
    },
    InsertWord {
        after: Option<String>,
        text: String,
    },
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum EditError {
    #[error("no Word with id {0}")]
    UnknownWord(String),
    #[error("{0:?} is not one Word")]
    NotOneWord(String),
    #[error("cannot split a {length}-character Word at {at}")]
    InvalidSplit { at: usize, length: usize },
    #[error("no Word follows {0}")]
    NothingAfter(String),
}

impl Script {
    pub fn apply(&mut self, edit: Edit, ids: &mut Ids) -> Result<(), EditError> {
        match edit {
            Edit::Correct { word, text } => {
                let word = self.word_mut(&word)?;
                word.text = one_word(text)?;
                word.confidence = None;
            }
            Edit::Split { word, at } => {
                let index = self.index_of(&word)?;
                let second = transform::split(&mut self.words[index], at, ids.next_word())?;
                self.words.insert(index + 1, second);
            }
            Edit::Merge { word } => {
                let index = self.index_of(&word)?;
                if index + 1 == self.words.len() {
                    return Err(EditError::NothingAfter(word));
                }
                let second = self.words.remove(index + 1);
                transform::merge(&mut self.words[index], second);
            }
            Edit::Delete { words } => {
                for id in &words {
                    self.index_of(id)?;
                }
                transform::delete(&mut self.words, |word| words.contains(&word.id));
            }
            Edit::SetBreak { word, break_after } => {
                self.word_mut(&word)?.break_after = break_after;
            }
            Edit::InsertWord { after, text } => {
                let index = match after {
                    Some(id) => self.index_of(&id)? + 1,
                    None => 0,
                };
                let typed = self.typed_word(ids.next_word(), one_word(text)?, index);
                self.words.insert(index, typed);
            }
        }
        Ok(())
    }

    /// A typed Word going in at `index` takes the Gap of the Word it goes before, which then
    /// gets the median Gap; at the end it gets the median Gap, and into an empty Script none.
    fn typed_word(&mut self, id: String, text: String, index: usize) -> Word {
        let median_gap = estimate::median_gap(&self.words);
        let duration = estimate::typed_duration(&self.words, &text);
        let at_end_of_empty = self.words.is_empty();
        let gap = match self.words.get_mut(index) {
            Some(next) => std::mem::replace(&mut next.gap, median_gap),
            None if at_end_of_empty => 0,
            None => median_gap,
        };
        Word {
            id,
            duration,
            text,
            gap,
            recording_id: None,
            audio_start: None,
            audio_end: None,
            confidence: None,
            break_after: None,
        }
    }

    fn index_of(&self, id: &str) -> Result<usize, EditError> {
        self.words
            .iter()
            .position(|word| word.id == id)
            .ok_or_else(|| EditError::UnknownWord(id.to_string()))
    }

    fn word_mut(&mut self, id: &str) -> Result<&mut Word, EditError> {
        let index = self.index_of(id)?;
        Ok(&mut self.words[index])
    }
}

fn one_word(text: String) -> Result<String, EditError> {
    if text.is_empty() || text.chars().any(char::is_whitespace) {
        return Err(EditError::NotOneWord(text));
    }
    Ok(text)
}
