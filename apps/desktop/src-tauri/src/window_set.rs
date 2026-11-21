use std::collections::HashSet;
use std::sync::Mutex;

/// A set of windows, by label, shared across commands and window events.
#[derive(Default)]
pub struct WindowSet(Mutex<HashSet<String>>);

impl WindowSet {
    pub fn contains(&self, label: &str) -> bool {
        self.0.lock().unwrap().contains(label)
    }

    pub fn insert(&self, label: &str) {
        self.0.lock().unwrap().insert(label.to_string());
    }

    pub fn remove(&self, label: &str) {
        self.0.lock().unwrap().remove(label);
    }

    pub fn is_empty(&self) -> bool {
        self.0.lock().unwrap().is_empty()
    }
}
