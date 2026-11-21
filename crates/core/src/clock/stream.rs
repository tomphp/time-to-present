use serde::Serialize;
use serde_json::Value;

use crate::time::Ms;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ClockState {
    Ready,
    Playing,
    Paused,
    Ended,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Cause {
    Play,
    Pause,
    Speed,
    End,
    Reset,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockView {
    pub state: ClockState,
    pub script_time: Ms,
    pub speed: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordPayload {
    pub id: String,
    pub text: String,
    pub start: Ms,
    pub duration: Ms,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventPayload {
    pub id: String,
    pub name: String,
    pub data: Value,
    pub script_time: Ms,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub protocol_version: u32,
    pub script_version: u64,
    pub clock: ClockView,
    pub current_word: Option<WordPayload>,
    pub passed_events: Vec<EventPayload>,
}

/// One event of the broadcast stream every client receives, in Script Time order.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum StreamEvent {
    Snapshot(Snapshot),
    Clock {
        state: ClockState,
        script_time: Ms,
        speed: f64,
        cause: Cause,
    },
    Tick {
        script_time: Ms,
    },
    Word(WordPayload),
    NamedEvent(EventPayload),
    Closed {
        reason: String,
    },
}
