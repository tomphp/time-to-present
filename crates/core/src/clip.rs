use std::io::Cursor;
use std::path::Path;

use hound::{SampleFormat, WavReader, WavSpec, WavWriter};

use crate::time::Ms;

/// A Recording's audio from `from` to `until` in Recording Time, cut to the Recording's own
/// length, as a 16-bit WAV at its own rate that any audio decoder plays.
pub fn read(file: &Path, from: Ms, until: Ms) -> Result<Vec<u8>, hound::Error> {
    let mut wav = WavReader::open(file)?;
    let source = wav.spec();
    let frame_at = |ms: Ms| (ms.max(0) as u64 * u64::from(source.sample_rate) / 1000) as u32;
    let first = frame_at(from).min(wav.duration());
    let frames = frame_at(until).min(wav.duration()).saturating_sub(first);
    wav.seek(first)?;
    let samples = (frames * u32::from(source.channels)) as usize;

    let spec = WavSpec {
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
        ..source
    };
    let mut clip = Cursor::new(Vec::new());
    let mut writer = WavWriter::new(&mut clip, spec)?;
    match source.sample_format {
        SampleFormat::Float => {
            for sample in wav.samples::<f32>().take(samples) {
                writer.write_sample((sample?.clamp(-1.0, 1.0) * f32::from(i16::MAX)) as i16)?;
            }
        }
        SampleFormat::Int => {
            let shift = i32::from(source.bits_per_sample) - 16;
            for sample in wav.samples::<i32>().take(samples) {
                let sample = sample?;
                let scaled = if shift >= 0 {
                    sample >> shift
                } else {
                    sample << -shift
                };
                writer.write_sample(scaled as i16)?;
            }
        }
    }
    writer.finalize()?;
    Ok(clip.into_inner())
}
