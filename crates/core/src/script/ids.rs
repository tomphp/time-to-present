use std::collections::HashSet;

use super::Script;

/// Mints Word ids that no Word or Named Event has had: random, so an id deleted in an earlier
/// session can't come back, and checked against every id seen in this one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ids {
    taken: HashSet<String>,
}

impl Ids {
    pub fn after(script: &Script) -> Self {
        let words = script.words.iter().map(|word| word.id.clone());
        let events = script.named_events.iter().map(|event| event.id.clone());
        Self {
            taken: words.chain(events).collect(),
        }
    }

    pub fn next_word(&mut self) -> String {
        loop {
            let id = format!("w{:x}", random_u64());
            if self.taken.insert(id.clone()) {
                return id;
            }
        }
    }
}

fn random_u64() -> u64 {
    let mut bytes = [0; 8];
    getrandom::fill(&mut bytes).expect("the OS random source is available");
    u64::from_le_bytes(bytes)
}
