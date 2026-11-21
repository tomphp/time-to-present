use std::io::Cursor;
use std::path::Path;

use hound::{WavReader, WavWriter};

use crate::time::Ms;

/// A Recording's audio from `from` to `until` in Recording Time, cut to the Recording's own
/// length, as a WAV in the Recording's own format.
pub fn read(file: &Path, from: Ms, until: Ms) -> Result<Vec<u8>, hound::Error> {
    let mut wav = WavReader::open(file)?;
    let spec = wav.spec();
    let frame_at = |ms: Ms| (ms.max(0) as u64 * u64::from(spec.sample_rate) / 1000) as u32;
    let first = frame_at(from).min(wav.duration());
    let frames = frame_at(until).min(wav.duration()).saturating_sub(first);
    wav.seek(first)?;

    let mut clip = Cursor::new(Vec::new());
    let mut writer = WavWriter::new(&mut clip, spec)?;
    let samples = frames as usize * usize::from(spec.channels);
    for sample in wav.samples::<i32>().take(samples) {
        writer.write_sample(sample?)?;
    }
    writer.finalize()?;
    Ok(clip.into_inner())
}
