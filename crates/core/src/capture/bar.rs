use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use super::pipeline::{Pipeline, RecordingWriter};
use super::{Access, ActiveInput, CaptureError, Input, InputChoice, RecordingBarState, Taps};
use crate::platform::Platform;
use crate::store::Recording;
use crate::transcription::LiveModel;

/// The open recording bar: the chosen input metering live, and the Recording, if one is running.
pub struct RecordingBar {
    access: Access,
    inputs: Vec<Input>,
    active: Option<ActiveInput>,
    notice: Option<String>,
    live: Option<Live>,
    recording: Option<ActiveRecording>,
    live_model: LiveModel,
}

struct Live {
    pipeline: Arc<Mutex<Pipeline>>,
    _stream: Box<dyn Send>,
}

struct ActiveRecording {
    recording: Recording,
    path: PathBuf,
    _app_nap: Box<dyn Send>,
}

impl RecordingBar {
    pub fn open(platform: &Platform, choice: InputChoice, taps: &Arc<Taps>) -> Self {
        let mut bar = Self {
            access: platform.audio.request_access(),
            inputs: Vec::new(),
            active: None,
            notice: None,
            live: None,
            recording: None,
            live_model: LiveModel::Fetching { percent: None },
        };
        if bar.access == Access::Granted
            && let Err(error) = bar.select(platform, choice, taps)
        {
            bar.notice = Some(error.to_string());
        }
        bar
    }

    pub fn select(
        &mut self,
        platform: &Platform,
        choice: InputChoice,
        taps: &Arc<Taps>,
    ) -> Result<(), CaptureError> {
        if self.access == Access::Denied {
            return Err(CaptureError::NoAccess);
        }
        if self.recording.is_some() {
            return Err(CaptureError::AlreadyRecording);
        }
        self.live = None;
        self.active = None;
        self.notice = None;
        self.inputs = platform.audio.inputs();
        let (active, notices) = resolve(&self.inputs, platform.audio.default_input(), choice)?;
        self.notice = (!notices.is_empty()).then(|| notices.join(" "));
        let pipeline = Arc::new(Mutex::new(Pipeline::new(
            &active.device,
            active.choice.channel,
            taps.clone(),
        )));
        let audio = pipeline.clone();
        let stream = platform.audio.open(
            &active.device,
            Box::new(move |frames| audio.lock().unwrap().process(frames)),
        )?;
        self.live = Some(Live {
            pipeline,
            _stream: stream,
        });
        self.active = Some(active);
        Ok(())
    }

    pub fn is_recording(&self) -> bool {
        self.recording.is_some()
    }

    pub fn start(
        &mut self,
        platform: &Platform,
        recording: Recording,
        path: PathBuf,
    ) -> Result<(), CaptureError> {
        if self.recording.is_some() {
            return Err(CaptureError::AlreadyRecording);
        }
        if matches!(self.live_model, LiveModel::Fetching { .. }) {
            return Err(CaptureError::LiveModelFetching);
        }
        let pipeline = self.live()?;
        let sample_rate = self
            .active
            .as_ref()
            .ok_or(CaptureError::NoInput)?
            .device
            .sample_rate;
        let writer = RecordingWriter::create(&path, sample_rate)?;
        pipeline.lock().unwrap().record_into(writer);
        self.recording = Some(ActiveRecording {
            recording,
            path,
            _app_nap: platform.app_nap.hold_off("Recording"),
        });
        Ok(())
    }

    pub fn stop(&mut self) -> Result<Recording, CaptureError> {
        let (writer, active) = self.stop_writing()?;
        writer.finalize()?;
        Ok(active.recording)
    }

    pub fn cancel(&mut self) -> Result<(), CaptureError> {
        let (writer, active) = self.stop_writing()?;
        drop(writer);
        std::fs::remove_file(active.path)?;
        Ok(())
    }

    fn stop_writing(&mut self) -> Result<(RecordingWriter, ActiveRecording), CaptureError> {
        let writer = self
            .live()?
            .lock()
            .unwrap()
            .stop_recording()
            .ok_or(CaptureError::NotRecording)?;
        let active = self.recording.take().ok_or(CaptureError::NotRecording)?;
        Ok((writer, active))
    }

    pub fn state(&self) -> RecordingBarState {
        RecordingBarState {
            access: self.access,
            inputs: self.inputs.clone(),
            input: self.active.clone(),
            notice: self.notice.clone(),
            recording: self.is_recording(),
            live_model: self.live_model.clone(),
        }
    }

    pub fn set_live_model(&mut self, model: LiveModel) {
        self.live_model = model;
    }

    fn live(&self) -> Result<&Arc<Mutex<Pipeline>>, CaptureError> {
        match (&self.access, &self.live) {
            (Access::Denied, _) => Err(CaptureError::NoAccess),
            (_, None) => Err(CaptureError::NoInput),
            (_, Some(live)) => Ok(&live.pipeline),
        }
    }
}

fn resolve(
    inputs: &[Input],
    default: Option<String>,
    choice: InputChoice,
) -> Result<(ActiveInput, Vec<String>), CaptureError> {
    let find = |name: &str| inputs.iter().find(|input| input.name == name);
    let fallback = || {
        default
            .as_deref()
            .and_then(find)
            .or(inputs.first())
            .ok_or(CaptureError::NoInput)
    };
    let mut notices = Vec::new();
    let (device, input) = match choice.device.as_deref().map(|name| (name, find(name))) {
        Some((name, Some(input))) => (Some(name.to_string()), input),
        Some((name, None)) => {
            notices.push(format!(
                "{name} is not connected, so the system default input is used."
            ));
            (None, fallback()?)
        }
        None => (None, fallback()?),
    };
    let channel = if (1..=input.channels).contains(&choice.channel) {
        choice.channel
    } else {
        notices.push(format!(
            "{} has no channel {}, so channel 1 is used.",
            input.name, choice.channel
        ));
        1
    };
    Ok((
        ActiveInput {
            choice: InputChoice { device, channel },
            device: input.clone(),
        },
        notices,
    ))
}
