use std::sync::Arc;

use crate::capture::AudioSource;
use crate::time::TimeSource;

/// Holds off App Nap until the returned activity assertion is dropped.
pub trait AppNap: Send + Sync {
    fn hold_off(&self, reason: &str) -> Box<dyn Send>;
}

/// What a Session needs from the machine it runs on.
#[derive(Clone)]
pub struct Platform {
    pub time: Arc<dyn TimeSource>,
    pub audio: Arc<dyn AudioSource>,
    pub app_nap: Arc<dyn AppNap>,
}
