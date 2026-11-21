use std::path::Path;

use hound::{SampleFormat, WavReader};
use serde::Serialize;

use crate::time::Ms;

pub const BUCKET: Ms = 10;

/// A Recording's peak level, from 0 to 1, in each bucket of Recording Time.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Waveform {
    pub bucket: Ms,
    pub peaks: Vec<f32>,
}

pub fn read(file: &Path) -> Result<Waveform, hound::Error> {
    let mut wav = WavReader::open(file)?;
    let spec = wav.spec();
    let bucket_samples = (spec.sample_rate as usize * BUCKET as usize / 1000).max(1);
    let mut peaks = Vec::new();
    let mut add = |index: usize, level: f32| {
        if index.is_multiple_of(bucket_samples) {
            peaks.push(0.0);
        }
        let peak = peaks.last_mut().expect("a bucket is open");
        *peak = level.max(*peak);
    };
    match spec.sample_format {
        SampleFormat::Float => {
            for (index, sample) in wav.samples::<f32>().enumerate() {
                add(index, sample?.abs());
            }
        }
        SampleFormat::Int => {
            let full_scale = ((1i64 << (spec.bits_per_sample - 1)) - 1) as f32;
            for (index, sample) in wav.samples::<i32>().enumerate() {
                add(index, sample?.unsigned_abs() as f32 / full_scale);
            }
        }
    }
    Ok(Waveform {
        bucket: BUCKET,
        peaks: peaks.into_iter().map(rounded).collect(),
    })
}

/// Peaks only drive a drawing, so a thousandth is fine enough and keeps them small to send.
fn rounded(peak: f32) -> f32 {
    (peak.min(1.0) * 1000.0).round() / 1000.0
}
