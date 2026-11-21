use crate::script::{Ids, Passage, Script};

/// The app's own clipboard. A cut passage pastes once under its own ids, as a move, while
/// none of them is in the Script; every other paste is a copy under new ids.
#[derive(Debug, Default)]
pub struct Clipboard {
    held: Option<Held>,
}

#[derive(Debug)]
enum Held {
    Cut(Passage),
    Copied(Passage),
}

pub struct Paste {
    pub passage: Passage,
    pub moved: Vec<String>,
}

impl Clipboard {
    pub fn hold_cut(&mut self, passage: Passage) {
        self.held = Some(Held::Cut(passage));
    }

    pub fn hold_copy(&mut self, passage: Passage) {
        self.held = Some(Held::Copied(passage));
    }

    /// What pasting `text` puts in, or None when the text is not the held passage.
    pub fn paste(&self, text: &str, script: &Script, ids: &mut Ids) -> Option<Paste> {
        let (passage, cut) = match self.held.as_ref()? {
            Held::Cut(passage) => (passage, true),
            Held::Copied(passage) => (passage, false),
        };
        if !passage.reads_as(text) {
            return None;
        }
        if cut && !passage.ids().any(|id| script.has(id)) {
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

    /// After a paste the held passage only ever pastes as a copy.
    pub fn pasted(&mut self) {
        self.held = self.held.take().map(|held| match held {
            Held::Cut(passage) | Held::Copied(passage) => Held::Copied(passage),
        });
    }
}
