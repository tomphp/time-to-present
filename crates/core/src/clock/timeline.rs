use serde_json::Value;

use super::{EventPayload, StreamEvent, WordPayload};
use crate::script::Script;
use crate::time::Ms;

/// The Script as the clock plays it: Words in Script order, which is start order, and Named
/// Events by Script Time then Script order, never before Script Time 0.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Timeline {
    pub version: u64,
    pub words: Vec<WordPayload>,
    pub events: Vec<EventPayload>,
    pub end: Ms,
}

impl Timeline {
    pub fn of(script: &Script, version: u64) -> Self {
        let words = script
            .timed_words()
            .into_iter()
            .map(|timed| WordPayload {
                id: timed.word.id,
                text: timed.word.text,
                start: timed.start,
                duration: timed.word.duration,
            })
            .collect();
        let mut events: Vec<EventPayload> = script
            .timed_events()
            .into_iter()
            .map(|timed| EventPayload {
                id: timed.event.id,
                name: timed.event.name,
                data: timed.event.data.unwrap_or(Value::Null),
                script_time: timed.time.max(0),
            })
            .collect();
        events.sort_by_key(|event| event.script_time);
        Self {
            version,
            words,
            events,
            end: script.end(),
        }
    }

    /// The Word being spoken at `time`, else the last one started.
    pub fn current_word(&self, time: Ms) -> Option<&WordPayload> {
        self.words.iter().rev().find(|word| word.start <= time)
    }

    /// Every Word and Named Event in (`after`, `up_to`], a Word first at equal times.
    pub fn crossed(&self, after: Ms, up_to: Ms) -> Vec<StreamEvent> {
        let mut words = self
            .words
            .iter()
            .filter(|word| after < word.start && word.start <= up_to)
            .peekable();
        let mut events = self
            .events
            .iter()
            .filter(|event| after < event.script_time && event.script_time <= up_to)
            .peekable();
        let mut crossed = Vec::new();
        loop {
            let word_first = match (words.peek(), events.peek()) {
                (Some(word), Some(event)) => word.start <= event.script_time,
                (Some(_), None) => true,
                (None, Some(_)) => false,
                (None, None) => return crossed,
            };
            crossed.push(if word_first {
                StreamEvent::Word(words.next().unwrap().clone())
            } else {
                StreamEvent::NamedEvent(events.next().unwrap().clone())
            });
        }
    }

    pub fn passed_events(&self, time: Ms) -> Vec<EventPayload> {
        self.events
            .iter()
            .filter(|event| event.script_time <= time)
            .cloned()
            .collect()
    }
}
