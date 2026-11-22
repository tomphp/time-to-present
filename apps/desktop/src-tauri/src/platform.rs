#[cfg(not(target_os = "macos"))]
mod fallback;
#[cfg(target_os = "macos")]
mod macos;

#[cfg(not(target_os = "macos"))]
pub use fallback::{
    ProcessActivity, leave_full_screen_out_of_the_menu, open_in_browser, request_microphone_access,
};
#[cfg(target_os = "macos")]
pub use macos::{
    ProcessActivity, leave_full_screen_out_of_the_menu, open_in_browser, request_microphone_access,
};
