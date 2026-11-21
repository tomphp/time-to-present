use super::Script;

/// Mints Word ids that no Word or Named Event in the Script has ever had.
/// It only counts up, so an id undone away is never handed out again.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ids {
    next: u64,
}

impl Ids {
    pub fn after(script: &Script) -> Self {
        let words = script.words.iter().map(|word| word.id.as_str());
        let events = script.named_events.iter().map(|event| event.id.as_str());
        let highest = words.chain(events).filter_map(trailing_number).max();
        Self {
            next: highest.map_or(1, |n| n + 1),
        }
    }

    pub fn next_word(&mut self) -> String {
        let id = format!("w{}", self.next);
        self.next += 1;
        id
    }
}

fn trailing_number(id: &str) -> Option<u64> {
    let prefix = id.trim_end_matches(|c: char| c.is_ascii_digit()).len();
    id[prefix..].parse().ok()
}
