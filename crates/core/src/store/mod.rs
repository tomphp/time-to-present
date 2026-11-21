use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

mod format;

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
        recordings: Vec::new(),
        script: Script::default(),
    };
    save(&folder, &presentation)?;
    Ok(folder)
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
        std::fs::write(app_source.join(name), contents)?;
    }
    Ok(())
}

fn folder_name(title: &str) -> String {
    title.replace(['/', ':'], "-")
}
