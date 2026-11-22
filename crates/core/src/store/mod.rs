use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

mod format;
mod wav;

use crate::perform::PresentationSize;
use crate::script::Script;
use crate::template;

pub const FORMAT_VERSION: u32 = 1;
const PRESENTATION_FILE: &str = "presentation.json";
const RECORDINGS_DIR: &str = "recordings";
const APP_SOURCE_DIR: &str = "app-src";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Recording {
    pub id: String,
    pub file: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Presentation {
    pub title: String,
    #[serde(default, rename = "presentationSize")]
    pub presentation_size: PresentationSize,
    pub recordings: Vec<Recording>,
    #[serde(flatten)]
    pub script: Script,
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("a Presentation needs a title")]
    EmptyTitle,
    #[error("{} already exists", .0.display())]
    AlreadyExists(PathBuf),
    #[error("{} has no presentation.json", .0.display())]
    NotAPresentation(PathBuf),
    #[error("this Presentation uses format {found}, newer than this app supports ({supported})")]
    NewerFormat { found: u32, supported: u32 },
    #[error("presentation.json has no usable {0}")]
    Malformed(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("presentation.json is not valid: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn open(folder: &Path) -> Result<Presentation, StoreError> {
    let json =
        std::fs::read_to_string(folder.join(PRESENTATION_FILE)).map_err(|error| {
            match error.kind() {
                std::io::ErrorKind::NotFound => StoreError::NotAPresentation(folder.to_path_buf()),
                _ => error.into(),
            }
        })?;
    let parsed = format::parse(&json)?;
    if parsed.migrated {
        save(folder, &parsed.presentation)?;
    }
    Ok(parsed.presentation)
}

pub fn create(parent: &Path, title: &str) -> Result<PathBuf, StoreError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(StoreError::EmptyTitle);
    }
    let folder = parent.join(folder_name(title));
    std::fs::create_dir(&folder).map_err(|error| match error.kind() {
        std::io::ErrorKind::AlreadyExists => StoreError::AlreadyExists(folder.clone()),
        _ => error.into(),
    })?;
    std::fs::create_dir(folder.join(RECORDINGS_DIR))?;
    write_template(&folder.join(APP_SOURCE_DIR))?;
    let presentation = Presentation {
        title: title.to_string(),
        presentation_size: PresentationSize::default(),
        recordings: Vec::new(),
        script: Script::default(),
    };
    save(&folder, &presentation)?;
    Ok(folder)
}

/// A new Recording whose id no registered Recording or file in `recordings/` has used.
pub fn new_recording(folder: &Path, presentation: &Presentation) -> Result<Recording, StoreError> {
    let recordings = folder.join(RECORDINGS_DIR);
    std::fs::create_dir_all(&recordings)?;
    let registered = presentation
        .recordings
        .iter()
        .map(|recording| recording.id.clone());
    let on_disk = std::fs::read_dir(recordings)?
        .filter_map(|entry| Some(entry.ok()?.path().file_stem()?.to_str()?.to_string()));
    let next = registered
        .chain(on_disk)
        .filter_map(|id| id.strip_prefix('r')?.parse::<u64>().ok())
        .max()
        .unwrap_or(0)
        + 1;
    let id = format!("r{next}");
    Ok(Recording {
        file: format!("{RECORDINGS_DIR}/{id}.wav"),
        id,
    })
}

/// The Recordings in `recordings/` that no Word references, registered or not, oldest first,
/// with any WAV header a crash left unfixed brought up to the length on disk. A file that is
/// no WAV at all is still returned, for the presenter to Discard.
pub fn unreferenced_recordings(
    folder: &Path,
    presentation: &Presentation,
) -> Result<Vec<Recording>, StoreError> {
    let Ok(entries) = std::fs::read_dir(folder.join(RECORDINGS_DIR)) else {
        return Ok(Vec::new());
    };
    let referenced: HashSet<&str> = presentation.script.recording_ids().collect();
    let mut found = Vec::new();
    for entry in entries {
        let path = entry?.path();
        let (Some(stem), Some("wav")) = (
            path.file_stem().and_then(|stem| stem.to_str()),
            path.extension().and_then(|extension| extension.to_str()),
        ) else {
            continue;
        };
        let Some(number) = stem.strip_prefix('r').and_then(|n| n.parse::<u64>().ok()) else {
            continue;
        };
        if !referenced.contains(stem) {
            found.push((number, stem.to_string()));
        }
    }
    found.sort();
    let recordings: Vec<Recording> = found
        .into_iter()
        .map(|(_, id)| Recording {
            file: format!("{RECORDINGS_DIR}/{id}.wav"),
            id,
        })
        .collect();
    for recording in &recordings {
        let _ = wav::fix_header(&folder.join(&recording.file));
    }
    Ok(recordings)
}

pub fn save(folder: &Path, presentation: &Presentation) -> Result<(), StoreError> {
    let path = folder.join(PRESENTATION_FILE);
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, format::to_json(presentation)?)?;
    std::fs::rename(temp, path)?;
    Ok(())
}

fn write_template(app_source: &Path) -> Result<(), StoreError> {
    std::fs::create_dir(app_source)?;
    for (name, contents) in template::FILES {
        let path = app_source.join(name);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, contents)?;
    }
    Ok(())
}

fn folder_name(title: &str) -> String {
    title.replace(['/', ':'], "-")
}
