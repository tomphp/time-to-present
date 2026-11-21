use std::fs::File;
use std::io::BufWriter;
use std::path::Path;
use std::sync::{Arc, Mutex};

use hound::{SampleFormat, WavSpec, WavWriter};

use super::{CaptureError, FEED_SAMPLE_RATE, Input, Meter, Resampler};
use crate::time::Ms;

const CLIP_LEVEL: f32 = 0.999;
const FULL_SCALE_24_BIT: f32 = 8_388_607.0;
const METERS_PER_SECOND: u32 = 20;

type MeterListener = Box<dyn Fn(Meter) + Send>;
type FeedListener = Box<dyn FnMut(&[f32]) + Send>;

/// Where a Session's capture output goes: Meters, and the 16 kHz feed while recording.
#[derive(Default)]
pub struct Taps {
    meters: Mutex<Vec<MeterListener>>,
    feeds: Mutex<Vec<FeedListener>>,
}

impl Taps {
    pub fn add_meter(&self, listener: impl Fn(Meter) + Send + 'static) {
        self.meters.lock().unwrap().push(Box::new(listener));
    }

    pub fn add_feed(&self, listener: impl FnMut(&[f32]) + Send + 'static) {
        self.feeds.lock().unwrap().push(Box::new(listener));
    }

    fn meter(&self, meter: Meter) {
        self.meters
            .lock()
            .unwrap()
            .iter()
            .for_each(|listener| listener(meter));
    }

    fn feed(&self, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }
        self.feeds
            .lock()
            .unwrap()
            .iter_mut()
            .for_each(|listener| listener(samples));
    }
}

/// Turns one input's interleaved frames into Meters and, while recording, a WAV of one channel.
pub struct Pipeline {
    channels: usize,
    channel: usize,
    sample_rate: u32,
    peak: f32,
    clipped: bool,
    metered: u32,
    writer: Option<RecordingWriter>,
    taps: Arc<Taps>,
}

/// The WAV of a running Recording and its 16 kHz feed. It is made and finalized outside the
/// Pipeline, so the audio thread never waits on that file I/O.
pub struct RecordingWriter {
    wav: WavWriter<BufWriter<File>>,
    frames: u64,
    feed: Resampler,
    failure: Option<hound::Error>,
}

impl Pipeline {
    pub fn new(input: &Input, channel: u16, taps: Arc<Taps>) -> Self {
        Self {
            channels: usize::from(input.channels),
            channel: usize::from(channel - 1),
            sample_rate: input.sample_rate,
            peak: 0.0,
            clipped: false,
            metered: 0,
            writer: None,
            taps,
        }
    }

    pub fn process(&mut self, interleaved: &[f32]) {
        let mono: Vec<f32> = interleaved
            .chunks_exact(self.channels)
            .map(|frame| frame[self.channel])
            .collect();
        for &sample in &mono {
            if let Some(writer) = &mut self.writer {
                writer.write(sample);
            }
            self.measure(sample);
        }
        if let Some(writer) = &mut self.writer {
            self.taps.feed(&writer.feed.process(&mono));
        }
    }

    pub fn record_into(&mut self, writer: RecordingWriter) {
        self.writer = Some(writer);
    }

    pub fn stop_recording(&mut self) -> Option<RecordingWriter> {
        self.writer.take()
    }

    fn measure(&mut self, sample: f32) {
        self.peak = self.peak.max(sample.abs());
        self.clipped |= sample.abs() >= CLIP_LEVEL;
        self.metered += 1;
        if self.metered < self.sample_rate / METERS_PER_SECOND {
            return;
        }
        let recorded = self
            .writer
            .as_ref()
            .map(|writer| (writer.frames * 1000 / u64::from(self.sample_rate)) as Ms);
        self.taps.meter(Meter {
            peak: self.peak,
            clipped: self.clipped,
            recorded,
        });
        self.peak = 0.0;
        self.clipped = false;
        self.metered = 0;
    }
}

impl RecordingWriter {
    pub fn create(path: &Path, sample_rate: u32) -> Result<Self, CaptureError> {
        let spec = WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 24,
            sample_format: SampleFormat::Int,
        };
        Ok(Self {
            wav: WavWriter::create(path, spec)?,
            frames: 0,
            feed: Resampler::new(sample_rate, FEED_SAMPLE_RATE),
            failure: None,
        })
    }

    pub fn finalize(self) -> Result<(), CaptureError> {
        if let Some(failure) = self.failure {
            return Err(failure.into());
        }
        self.wav.finalize()?;
        Ok(())
    }

    fn write(&mut self, sample: f32) {
        let value = (sample.clamp(-1.0, 1.0) * FULL_SCALE_24_BIT).round() as i32;
        if let Err(failure) = self.wav.write_sample(value) {
            self.failure.get_or_insert(failure);
        }
        self.frames += 1;
    }
}
