use std::sync::mpsc;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObjectProtocol, ProtocolObject};
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
use ttp_core::capture::Access;
use ttp_core::platform::AppNap;

/// Asks for the microphone if the presenter has not yet answered, blocking until they do.
pub fn request_microphone_access() -> Access {
    let Some(audio) = (unsafe { AVMediaTypeAudio }) else {
        return Access::Denied;
    };
    match unsafe { AVCaptureDevice::authorizationStatusForMediaType(audio) } {
        AVAuthorizationStatus::Authorized => Access::Granted,
        AVAuthorizationStatus::NotDetermined => {
            let (answer, answered) = mpsc::channel();
            let handler = RcBlock::new(move |granted: Bool| {
                let _ = answer.send(granted.as_bool());
            });
            unsafe {
                AVCaptureDevice::requestAccessForMediaType_completionHandler(audio, &handler)
            };
            match answered.recv() {
                Ok(true) => Access::Granted,
                _ => Access::Denied,
            }
        }
        _ => Access::Denied,
    }
}

pub struct ProcessActivity;

struct Activity(Retained<ProtocolObject<dyn NSObjectProtocol>>);

// SAFETY: NSProcessInfo's activity tokens are opaque and may be ended from any thread.
unsafe impl Send for Activity {}

impl Drop for Activity {
    fn drop(&mut self) {
        unsafe { NSProcessInfo::processInfo().endActivity(&self.0) };
    }
}

impl AppNap for ProcessActivity {
    fn hold_off(&self, reason: &str) -> Box<dyn Send> {
        let activity = NSProcessInfo::processInfo().beginActivityWithOptions_reason(
            NSActivityOptions::UserInitiated,
            &NSString::from_str(reason),
        );
        Box::new(Activity(activity))
    }
}
