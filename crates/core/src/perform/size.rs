use std::ops::RangeInclusive;

use serde::{Deserialize, Serialize};

/// The size at which the Presentation Window shows the Presentation App.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "Written", into = "Written")]
pub enum PresentationSize {
    FillDisplay,
    Pixels(PixelSize),
}

impl Default for PresentationSize {
    fn default() -> Self {
        Self::Pixels(PixelSize::preset_size(1920, 1080))
    }
}

/// A width and height in pixels of the Presentation Window's content.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct PixelSize {
    width: u32,
    height: u32,
}

const PIXELS: RangeInclusive<u32> = 320..=7680;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error(
    "{width}×{height} is not a Presentation Size: each way is {} to {} pixels",
    PIXELS.start(),
    PIXELS.end()
)]
pub struct OutOfBounds {
    width: u32,
    height: u32,
}

impl PixelSize {
    pub fn new(width: u32, height: u32) -> Result<Self, OutOfBounds> {
        if PIXELS.contains(&width) && PIXELS.contains(&height) {
            Ok(Self { width, height })
        } else {
            Err(OutOfBounds { width, height })
        }
    }

    pub(super) const fn preset_size(width: u32, height: u32) -> Self {
        Self { width, height }
    }
}

/// A display's size in points and how many pixels it shows per point.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DisplayArea {
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}

/// The window to open for a Presentation Size on a display.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FittedWindow {
    pub points: (f64, f64),
    /// The pixels of content actually shown, fewer than asked for when the window shrank.
    pub pixels: (u32, u32),
    pub shrank: bool,
    /// Only Fill display goes fullscreen, and only on a display the Teleprompter does not share.
    pub fullscreen_on_own_display: bool,
}

/// Fits a Presentation Size to a display, shrinking it to the largest window of the same shape
/// when it does not fit.
pub fn fit(size: PresentationSize, display: DisplayArea) -> FittedWindow {
    let PresentationSize::Pixels(PixelSize { width, height }) = size else {
        return fill(display);
    };
    let asked = (
        f64::from(width) / display.scale,
        f64::from(height) / display.scale,
    );
    if asked.0 <= display.width && asked.1 <= display.height {
        return FittedWindow {
            points: asked,
            pixels: (width, height),
            shrank: false,
            fullscreen_on_own_display: false,
        };
    }
    FittedWindow {
        shrank: true,
        ..shown(largest_of_shape(asked, display), display)
    }
}

fn fill(display: DisplayArea) -> FittedWindow {
    FittedWindow {
        fullscreen_on_own_display: true,
        ..shown(largest_of_shape((16.0, 9.0), display), display)
    }
}

fn shown(points: (f64, f64), display: DisplayArea) -> FittedWindow {
    FittedWindow {
        points,
        pixels: (
            (points.0 * display.scale).round() as u32,
            (points.1 * display.scale).round() as u32,
        ),
        shrank: false,
        fullscreen_on_own_display: false,
    }
}

fn largest_of_shape((width, height): (f64, f64), display: DisplayArea) -> (f64, f64) {
    if width * display.height > height * display.width {
        (
            display.width.floor(),
            (display.width * height / width).floor(),
        )
    } else {
        (
            (display.height * width / height).floor(),
            display.height.floor(),
        )
    }
}

/// Written as `"fillDisplay"` or `{ "width": 1080, "height": 1920 }`.
#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum Written {
    Named(Named),
    Pixels { width: u32, height: u32 },
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Named {
    FillDisplay,
}

impl From<PresentationSize> for Written {
    fn from(size: PresentationSize) -> Self {
        match size {
            PresentationSize::FillDisplay => Self::Named(Named::FillDisplay),
            PresentationSize::Pixels(PixelSize { width, height }) => Self::Pixels { width, height },
        }
    }
}

impl TryFrom<Written> for PresentationSize {
    type Error = OutOfBounds;

    fn try_from(written: Written) -> Result<Self, OutOfBounds> {
        match written {
            Written::Named(Named::FillDisplay) => Ok(Self::FillDisplay),
            Written::Pixels { width, height } => PixelSize::new(width, height).map(Self::Pixels),
        }
    }
}
