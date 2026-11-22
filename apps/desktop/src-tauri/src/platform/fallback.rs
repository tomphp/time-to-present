use std::process::Command;

use ttp_core::capture::Access;
use ttp_core::platform::AppNap;

/// Only macOS makes an app ask before it listens to the microphone.
pub fn request_microphone_access() -> Access {
    Access::Granted
}

/// Only AppKit adds a Full Screen item of its own.
pub fn leave_full_screen_out_of_the_menu() {}

pub fn open_in_browser(url: &str) -> std::io::Result<()> {
    let opener = if cfg!(windows) {
        "explorer"
    } else {
        "xdg-open"
    };
    Command::new(opener).arg(url).spawn().map(drop)
}

pub struct ProcessActivity;

/// App Nap is macOS-only, so there is nothing to hold off.
impl AppNap for ProcessActivity {
    fn hold_off(&self, _reason: &str) -> Box<dyn Send> {
        Box::new(())
    }
}
