use super::Session;
use crate::clock::{Clock, ScriptView, StreamEvent, Timeline};
use crate::time::Ms;

impl Session {
    /// Receives every event the Session broadcasts from now on, in Script Time order.
    pub fn subscribe_stream(&mut self, listener: impl Fn(&StreamEvent) + Send + 'static) {
        self.stream_listeners.push(Box::new(listener));
    }

    /// The Script as Presentation Apps read it, at the version the stream last announced.
    pub fn script(&self) -> ScriptView {
        ScriptView::of(&self.presentation.script, &self.timeline)
    }

    pub fn play(&mut self) {
        self.run_clock(Clock::play);
    }

    /// Plays the clock as a Preview, from `from` or else from where it stands, unless it is
    /// already playing: a running clock stays with whoever started it. A ready clock asked to
    /// start from the start plays without a seek, so what is at Script Time 0 fires live.
    pub fn preview(&mut self, from: Option<Ms>) {
        if self.clock.is_playing() {
            return;
        }
        if let Some(script_time) = from
            && !(self.clock.is_ready() && script_time <= 0)
        {
            self.seek(script_time);
        }
        self.previewing = true;
        self.run_clock(Clock::play);
    }

    pub fn pause(&mut self) {
        self.run_clock(Clock::pause);
    }

    pub fn seek(&mut self, script_time: Ms) {
        self.run_clock(|clock, timeline, now| clock.seek(timeline, now, script_time));
    }

    pub fn set_speed(&mut self, factor: f64) {
        self.run_clock(|clock, timeline, now| clock.set_speed(timeline, now, factor));
    }

    pub fn reset(&mut self) {
        self.run_clock(Clock::reset);
    }

    pub(super) fn advance_clock(&mut self) {
        self.run_clock(Clock::advance);
    }

    fn run_clock(&mut self, command: impl FnOnce(&mut Clock, &Timeline, Ms) -> Vec<StreamEvent>) {
        let now = self.platform.time.now();
        let was_playing = self.clock.is_playing();
        let events = command(&mut self.clock, &self.timeline, now);
        self.previewing &= self.clock.is_playing();
        self.broadcast(events);
        if self.clock.is_playing() != was_playing {
            self.hold_off_app_nap_while_playing();
            self.publish();
        }
    }

    fn hold_off_app_nap_while_playing(&mut self) {
        self.performing = self
            .clock
            .is_playing()
            .then(|| self.platform.app_nap.hold_off("Performance"));
    }
}
