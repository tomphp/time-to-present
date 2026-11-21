use crate::script::{Ids, Passage, Script};

/// The app's own clipboard. A cut passage pastes once under its own ids, as a move, while
/// none of them is in the Script; every other paste is a copy under new ids.
#[derive(Debug, Default)]
pub struct Clipboard {
    passage: Option<Passage>,
    moving: bool,
}

pub struct Paste {
    pub passage: Passage,
    pub moved: Vec<String>,
}

impl Clipboard {
    pub fn hold(&mut self, passage: Passage, moving: bool) {
        self.passage = Some(passage);
        self.moving = moving;
    }

    /// What pasting `text` puts in, or None when the text is not the held passage.
    pub fn paste(&self, text: &str, script: &Script, ids: &mut Ids) -> Option<Paste> {
        let passage = self.passage.as_ref().filter(|held| held.reads_as(text))?;
        if self.moving && !passage.ids().any(|id| script.has(id)) {
            return Some(Paste {
                moved: passage.event_ids(),
                passage: passage.clone(),
            });
        }
        Some(Paste {
            passage: passage.renewed(ids),
            moved: Vec::new(),
        })
    }

    pub fn pasted(&mut self) {
        self.moving = false;
    }
}
