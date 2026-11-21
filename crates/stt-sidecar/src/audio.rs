use std::f64::consts::PI;
use std::path::Path;

use hound::{SampleFormat, WavReader};

use crate::engine::SAMPLE_RATE;

const ZERO_CROSSINGS: f64 = 16.0;

/// Reads a WAV file of any rate, depth and channel count as 16 kHz mono.
pub fn read_wav(path: &Path) -> Result<Vec<f32>, String> {
    let reader = WavReader::open(path).map_err(|e| e.to_string())?;
    let spec = reader.spec();
    let interleaved: Vec<f32> = match spec.sample_format {
        SampleFormat::Float => reader.into_samples::<f32>().collect::<Result<_, _>>(),
        SampleFormat::Int => {
            let scale = (1_i64 << (spec.bits_per_sample - 1)) as f32;
            reader
                .into_samples::<i32>()
                .map(|s| s.map(|s| s as f32 / scale))
                .collect()
        }
    }
    .map_err(|e| e.to_string())?;
    let mono = mix_down(&interleaved, usize::from(spec.channels));
    Ok(resample(&mono, spec.sample_rate as usize, SAMPLE_RATE))
}

/// Decodes 16-bit little-endian PCM.
pub fn decode_pcm(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if !bytes.len().is_multiple_of(2) {
        return Err("audio must be whole 16-bit samples".into());
    }
    Ok(bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| f32::from(i16::from_le_bytes(*pair)) / 32768.0)
        .collect())
}

fn mix_down(interleaved: &[f32], channels: usize) -> Vec<f32> {
    interleaved
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

fn resample(input: &[f32], from: usize, to: usize) -> Vec<f32> {
    if from == to {
        return input.to_vec();
    }
    let step = from as f64 / to as f64;
    let cutoff = (to as f64 / from as f64).min(1.0);
    let reach = ZERO_CROSSINGS / cutoff;
    let len = input.len() * to / from;
    (0..len)
        .map(|n| {
            let centre = n as f64 * step;
            let first = (centre - reach).ceil().max(0.0) as usize;
            let last = ((centre + reach).floor() as usize).min(input.len() - 1);
            let (sum, weight) = (first..=last).fold((0.0, 0.0), |(sum, weight), k| {
                let w = kernel((k as f64 - centre) * cutoff);
                (sum + w * f64::from(input[k]), weight + w)
            });
            (sum / weight) as f32
        })
        .collect()
}

fn kernel(x: f64) -> f64 {
    let window = 0.5 + 0.5 * (PI * x / ZERO_CROSSINGS).cos();
    let sinc = if x == 0.0 {
        1.0
    } else {
        (PI * x).sin() / (PI * x)
    };
    sinc * window
}
