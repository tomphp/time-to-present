use serde::Serialize;

use super::{EventPayload, PROTOCOL_VERSION, Timeline};
use crate::script::{BreakAfter, Script};
use crate::time::Ms;

/// The read-only Script a Presentation App fetches: Words with their absolute start, and Named
/// Events at the Script Time they fire, in firing order.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptView {
    pub protocol_version: u32,
    pub script_version: u64,
    pub script_end: Ms,
    pub words: Vec<ScriptWord>,
    pub named_events: Vec<EventPayload>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptWord {
    pub id: String,
    pub text: String,
    pub start: Ms,
    pub duration: Ms,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub break_after: Option<BreakAfter>,
}

impl ScriptView {
    pub fn of(script: &Script, timeline: &Timeline) -> Self {
        let words = script
            .timed_words()
            .into_iter()
            .map(|timed| ScriptWord {
                id: timed.word.id,
                text: timed.word.text,
                start: timed.start,
                duration: timed.word.duration,
                break_after: timed.word.break_after,
            })
            .collect();
        Self {
            protocol_version: PROTOCOL_VERSION,
            script_version: timeline.version,
            script_end: timeline.end,
            words,
            named_events: timeline.events.clone(),
        }
    }
}
