use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

const RECENT_LIMIT: usize = 10;

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Values {
    #[serde(default)]
    recent: Vec<PathBuf>,
    #[serde(flatten)]
    other: Map<String, Value>,
}

/// Per-machine settings, kept in one JSON file outside any Presentation.
pub struct Settings {
    path: PathBuf,
    values: Values,
}

impl Settings {
    pub fn load(path: PathBuf) -> Self {
        let values = std::fs::read_to_string(&path)
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default();
        Self { path, values }
    }

    pub fn recent(&self) -> &[PathBuf] {
        &self.values.recent
    }

    pub fn add_recent(&mut self, folder: &Path) -> Result<(), SettingsError> {
        self.values.recent.retain(|recent| recent != folder);
        self.values.recent.insert(0, folder.to_path_buf());
        self.values.recent.truncate(RECENT_LIMIT);
        self.save()
    }

    pub fn forget_recent(&mut self, folder: &Path) -> Result<(), SettingsError> {
        self.values.recent.retain(|recent| recent != folder);
        self.save()
    }

    pub fn drop_missing(&mut self) -> Result<Vec<PathBuf>, SettingsError> {
        let (kept, dropped): (Vec<_>, Vec<_>) = std::mem::take(&mut self.values.recent)
            .into_iter()
            .partition(|folder| folder.is_dir());
        self.values.recent = kept;
        if !dropped.is_empty() {
            self.save()?;
        }
        Ok(dropped)
    }

    fn save(&self) -> Result<(), SettingsError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let temp = self.path.with_extension("json.tmp");
        std::fs::write(&temp, serde_json::to_string_pretty(&self.values)?)?;
        std::fs::rename(temp, &self.path)?;
        Ok(())
    }
}
