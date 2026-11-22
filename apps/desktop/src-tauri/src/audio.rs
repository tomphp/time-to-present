use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, SampleFormat};
use ttp_core::capture::{Access, AudioCallback, AudioSource, CaptureError, Input};

/// The machine's audio inputs through cpal, in each input's default format.
pub struct CpalSource {
    host: Host,
}

impl CpalSource {
    pub fn new() -> Self {
        Self {
            host: cpal::default_host(),
        }
    }

    fn input(device: &Device) -> Option<Input> {
        let config = device.default_input_config().ok()?;
        Some(Input {
            name: device.to_string(),
            channels: config.channels(),
            sample_rate: config.sample_rate(),
        })
    }

    fn device(&self, name: &str) -> Option<Device> {
        self.host
            .input_devices()
            .ok()?
            .find(|device| device.to_string() == name)
    }
}

impl AudioSource for CpalSource {
    fn request_access(&self) -> Access {
        crate::platform::request_microphone_access()
    }

    fn inputs(&self) -> Vec<Input> {
        self.host
            .input_devices()
            .map(|devices| devices.filter_map(|device| Self::input(&device)).collect())
            .unwrap_or_default()
    }

    fn default_input(&self) -> Option<String> {
        self.host
            .default_input_device()
            .map(|device| device.to_string())
    }

    fn open(
        &self,
        input: &Input,
        mut on_audio: AudioCallback,
    ) -> Result<Box<dyn Send>, CaptureError> {
        let failed = |error: cpal::Error| CaptureError::Device(error.to_string());
        let device = self
            .device(&input.name)
            .ok_or_else(|| CaptureError::Device(format!("{} is not connected", input.name)))?;
        let config = device.default_input_config().map_err(failed)?;
        if config.sample_format() != SampleFormat::F32 {
            return Err(CaptureError::Device(format!(
                "{} delivers {} samples, not 32-bit float",
                input.name,
                config.sample_format()
            )));
        }
        let stream = device
            .build_input_stream::<f32, _, _>(
                config.into(),
                move |frames, _| on_audio(frames),
                |error| eprintln!("audio input failed: {error}"),
                None,
            )
            .map_err(failed)?;
        stream.play().map_err(failed)?;
        Ok(Box::new(stream))
    }
}
