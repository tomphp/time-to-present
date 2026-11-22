use serde::Serialize;

use super::PixelSize;

/// The shape of a Size Preset, for grouping and labelling it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Shape {
    Landscape,
    Vertical,
    Square,
    Portrait,
}

/// One of the suggested Presentation Sizes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct SizePreset {
    #[serde(flatten)]
    pub size: PixelSize,
    pub shape: Shape,
}

const fn preset(width: u32, height: u32, shape: Shape) -> SizePreset {
    SizePreset {
        size: PixelSize::preset_size(width, height),
        shape,
    }
}

pub const SIZE_PRESETS: &[SizePreset] = &[
    preset(1280, 720, Shape::Landscape),
    preset(1920, 1080, Shape::Landscape),
    preset(2560, 1440, Shape::Landscape),
    preset(3840, 2160, Shape::Landscape),
    preset(720, 1280, Shape::Vertical),
    preset(1080, 1920, Shape::Vertical),
    preset(1080, 1080, Shape::Square),
    preset(1080, 1350, Shape::Portrait),
];

impl PixelSize {
    /// The Size Preset this size is, if any: a custom size equal to a preset is that preset.
    pub fn preset(self) -> Option<SizePreset> {
        SIZE_PRESETS
            .iter()
            .copied()
            .find(|preset| preset.size == self)
    }
}
