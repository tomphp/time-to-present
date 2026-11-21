use std::time::Instant;

pub type Ms = i64;

pub trait TimeSource: Send + Sync {
    fn now(&self) -> Ms;
}

pub struct MonotonicTime(Instant);

impl MonotonicTime {
    pub fn new() -> Self {
        Self(Instant::now())
    }
}

impl Default for MonotonicTime {
    fn default() -> Self {
        Self::new()
    }
}

impl TimeSource for MonotonicTime {
    fn now(&self) -> Ms {
        self.0.elapsed().as_millis() as Ms
    }
}
