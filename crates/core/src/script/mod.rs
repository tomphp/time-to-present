use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;

use crate::time::Ms;

mod edit;
mod estimate;
mod events;
mod ids;
mod reanchor;
mod transform;

pub use edit::{Edit, EditError};
pub use ids::Ids;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub id: String,
    pub text: String,
    pub gap: Ms,
    pub duration: Ms,
    pub recording_id: Option<String>,
    pub audio_start: Option<Ms>,
    pub audio_end: Option<Ms>,
    pub confidence: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub break_after: Option<BreakAfter>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BreakAfter {
    Line,
    Paragraph,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NamedEvent {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    pub anchor: Anchor,
    pub offset: Ms,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Anchor {
    ScriptStart,
    Word(String),
}

const SCRIPT_START: &str = "scriptStart";

impl Serialize for Anchor {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Anchor::ScriptStart => serializer.serialize_str(SCRIPT_START),
            Anchor::Word(id) => serializer.serialize_str(id),
        }
    }
}

impl<'de> Deserialize<'de> for Anchor {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let anchor = String::deserialize(deserializer)?;
        Ok(if anchor == SCRIPT_START {
            Anchor::ScriptStart
        } else {
            Anchor::Word(anchor)
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TimedWord {
    #[serde(flatten)]
    pub word: Word,
    pub start: Ms,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TimedEvent {
    #[serde(flatten)]
    pub event: NamedEvent,
    pub time: Ms,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Script {
    pub words: Vec<Word>,
    pub named_events: Vec<NamedEvent>,
}

impl Script {
    pub fn timed_words(&self) -> Vec<TimedWord> {
        self.word_starts()
            .map(|(word, start)| TimedWord {
                word: word.clone(),
                start,
            })
            .collect()
    }

    pub fn timed_events(&self) -> Vec<TimedEvent> {
        let starts: Vec<(&Word, Ms)> = self.word_starts().collect();
        self.named_events
            .iter()
            .filter_map(|event| {
                Some(TimedEvent {
                    time: event_time(event, &starts)?,
                    event: event.clone(),
                })
            })
            .collect()
    }

    pub fn end(&self) -> Ms {
        let last_word_end = self
            .word_starts()
            .last()
            .map_or(0, |(word, start)| start + word.duration);
        let last_event = self
            .timed_events()
            .iter()
            .map(|timed| timed.time)
            .max()
            .unwrap_or(0);
        last_word_end.max(last_event)
    }

    fn word_starts(&self) -> impl Iterator<Item = (&Word, Ms)> {
        self.words.iter().scan(0, |previous_end, word| {
            let start = *previous_end + word.gap;
            *previous_end = start + word.duration;
            Some((word, start))
        })
    }
}

fn event_time(event: &NamedEvent, starts: &[(&Word, Ms)]) -> Option<Ms> {
    let anchor_time = match &event.anchor {
        Anchor::ScriptStart => 0,
        Anchor::Word(id) => starts.iter().find(|(word, _)| &word.id == id)?.1,
    };
    Some(anchor_time + event.offset)
}
