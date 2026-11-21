mod script_view;
mod speed;
mod stream;
mod timeline;

pub use script_view::{ScriptView, ScriptWord};
pub use speed::Speed;
pub use stream::{
    Cause, ClockState, ClockView, EventPayload, PROTOCOL_VERSION, Snapshot, StreamEvent,
    WordPayload,
};
pub use timeline::Timeline;

use crate::time::Ms;

/// How often a `tick` goes out while playing.
pub const TICK_INTERVAL: Ms = 100;

/// Before anything has fired, so that Words and Named Events at Script Time 0 cross on play.
const NOTHING_EMITTED: Ms = -1;

/// The one Performance clock: Script Time in integer ms over whatever wall time it is given.
/// Every command returns what it broadcasts, in Script Time order.
#[derive(Debug, Default)]
pub struct Clock {
    state: State,
    speed: Speed,
    last_tick: Ms,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
enum State {
    #[default]
    Ready,
    Playing {
        from: Ms,
        since: Ms,
        emitted_up_to: Ms,
    },
    Paused {
        at: Ms,
    },
    Ended {
        at: Ms,
    },
}

impl Clock {
    pub fn is_playing(&self) -> bool {
        matches!(self.state, State::Playing { .. })
    }

    pub fn play(&mut self, timeline: &Timeline, now: Ms) -> Vec<StreamEvent> {
        let (from, emitted_up_to) = match self.state {
            State::Ready => (0, NOTHING_EMITTED),
            State::Paused { at } => (at, at),
            State::Playing { .. } | State::Ended { .. } => return Vec::new(),
        };
        self.state = State::Playing {
            from,
            since: now,
            emitted_up_to,
        };
        self.last_tick = now;
        let mut events = vec![self.change(Cause::Play, now)];
        events.extend(self.advance(timeline, now));
        events
    }

    pub fn pause(&mut self, timeline: &Timeline, now: Ms) -> Vec<StreamEvent> {
        let mut events = self.advance(timeline, now);
        if let State::Playing { .. } = self.state {
            self.state = State::Paused {
                at: self.script_time(now),
            };
            events.push(self.change(Cause::Pause, now));
        }
        events
    }

    /// Lands on `target` within the Script, keeping the state, except that `ready` and
    /// `ended` become `paused`, and announces where it is with a Snapshot.
    pub fn seek(&mut self, timeline: &Timeline, now: Ms, target: Ms) -> Vec<StreamEvent> {
        let mut events = self.advance(timeline, now);
        let at = target.clamp(0, timeline.end);
        self.state = match self.state {
            State::Playing { .. } => State::Playing {
                from: at,
                since: now,
                emitted_up_to: at,
            },
            State::Ready | State::Paused { .. } | State::Ended { .. } => State::Paused { at },
        };
        events.push(StreamEvent::Snapshot(self.snapshot(timeline, now)));
        events
    }

    pub fn set_speed(&mut self, timeline: &Timeline, now: Ms, factor: f64) -> Vec<StreamEvent> {
        let speed = Speed::nearest(factor);
        if speed == self.speed {
            return Vec::new();
        }
        let mut events = self.advance(timeline, now);
        if let State::Playing { emitted_up_to, .. } = self.state {
            self.state = State::Playing {
                from: self.script_time(now),
                since: now,
                emitted_up_to,
            };
        }
        self.speed = speed;
        events.push(self.change(Cause::Speed, now));
        events
    }

    pub fn reset(&mut self, timeline: &Timeline, now: Ms) -> Vec<StreamEvent> {
        let mut events = self.advance(timeline, now);
        if self.state != State::Ready {
            self.state = State::Ready;
            events.push(self.change(Cause::Reset, now));
        }
        events
    }

    /// The Script changed under a clock that isn't playing: Script Time is kept, clamped to the
    /// new Script End, and an `ended` clock no longer at the end is `paused`.
    pub fn script_changed(&mut self, timeline: &Timeline, now: Ms) -> Vec<StreamEvent> {
        self.state = match self.state {
            State::Ready | State::Playing { .. } => self.state,
            State::Paused { at } => State::Paused {
                at: at.min(timeline.end),
            },
            State::Ended { at } if at >= timeline.end => State::Ended { at: timeline.end },
            State::Ended { at } => State::Paused { at },
        };
        vec![StreamEvent::Snapshot(self.snapshot(timeline, now))]
    }

    /// Runs the clock up to `now`: everything crossed since the last call, then a tick once
    /// the tick interval has passed, or the end once Script End is reached.
    pub fn advance(&mut self, timeline: &Timeline, now: Ms) -> Vec<StreamEvent> {
        let State::Playing { emitted_up_to, .. } = self.state else {
            return Vec::new();
        };
        let reached = self.script_time(now);
        if reached >= timeline.end {
            let mut events = timeline.crossed(emitted_up_to, timeline.end);
            self.state = State::Ended { at: timeline.end };
            events.push(self.change(Cause::End, now));
            return events;
        }
        let mut events = timeline.crossed(emitted_up_to, reached);
        if let State::Playing { emitted_up_to, .. } = &mut self.state {
            *emitted_up_to = reached;
        }
        if now - self.last_tick >= TICK_INTERVAL {
            self.last_tick = now;
            events.push(StreamEvent::Tick {
                script_time: reached,
            });
        }
        events
    }

    fn script_time(&self, now: Ms) -> Ms {
        match self.state {
            State::Ready => 0,
            State::Playing { from, since, .. } => from + (now - since) * self.speed,
            State::Paused { at } | State::Ended { at } => at,
        }
    }

    fn change(&self, cause: Cause, now: Ms) -> StreamEvent {
        let ClockView {
            state,
            script_time,
            speed,
        } = self.view(now);
        StreamEvent::Clock {
            state,
            script_time,
            speed,
            cause,
        }
    }

    pub fn view(&self, now: Ms) -> ClockView {
        let state = match self.state {
            State::Ready => ClockState::Ready,
            State::Playing { .. } => ClockState::Playing,
            State::Paused { .. } => ClockState::Paused,
            State::Ended { .. } => ClockState::Ended,
        };
        ClockView {
            state,
            script_time: self.script_time(now),
            speed: self.speed.factor(),
        }
    }

    /// Where the Performance stands at `now`, for a client connecting or a clock that seeks.
    pub fn snapshot(&self, timeline: &Timeline, now: Ms) -> Snapshot {
        let view = self.view(now);
        let (current_word, passed_events) = match self.state {
            State::Ready => (None, Vec::new()),
            _ => (
                timeline.current_word(view.script_time).cloned(),
                timeline.passed_events(view.script_time),
            ),
        };
        Snapshot {
            protocol_version: PROTOCOL_VERSION,
            script_version: timeline.version,
            clock: view,
            current_word,
            passed_events,
        }
    }
}
