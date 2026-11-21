use std::ops::Mul;

use crate::time::Ms;

const STEP: i64 = 5;
const SLOWEST: i64 = 50;
const FASTEST: i64 = 200;

/// A playback speed in hundredths, 0.50× to 2.00× in 0.05 steps, so Script Time stays exact.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Speed(i64);

impl Default for Speed {
    fn default() -> Self {
        Self(100)
    }
}

impl Speed {
    /// The nearest step to `factor`, clamped at the ends.
    pub fn nearest(factor: f64) -> Self {
        let hundredths = (factor * 100.0 / STEP as f64).round() as i64 * STEP;
        Self(hundredths.clamp(SLOWEST, FASTEST))
    }

    pub fn factor(self) -> f64 {
        self.0 as f64 / 100.0
    }
}

impl Mul<Speed> for Ms {
    type Output = Ms;

    fn mul(self, speed: Speed) -> Ms {
        self * speed.0 / 100
    }
}
