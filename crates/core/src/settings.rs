use std::net::{IpAddr, Ipv4Addr};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::capture::InputChoice;

const RECENT_LIMIT: usize = 10;
pub const DEFAULT_PORT: u16 = 4747;

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Serialize, Deserialize)]
struct Values {
    #[serde(default)]
    recent: Vec<PathBuf>,
    #[serde(default)]
    input: InputChoice,
    #[serde(default = "default_port")]
    port: u16,
    #[serde(default = "loopback", rename = "bindAddress")]
    bind_address: IpAddr,
    #[serde(flatten)]
    other: Map<String, Value>,
}

impl Default for Values {
    fn default() -> Self {
        Self {
            recent: Vec::new(),
            input: InputChoice::default(),
            port: DEFAULT_PORT,
            bind_address: loopback(),
            other: Map::new(),
        }
    }
}

fn default_port() -> u16 {
    DEFAULT_PORT
}

fn loopback() -> IpAddr {
    Ipv4Addr::LOCALHOST.into()
}

/// Where the event stream server listens. The bind address has no control in Settings: it is
/// kept so that LAN access can be added later.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ServerSettings {
    pub address: IpAddr,
    pub port: u16,
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

    pub fn input(&self) -> &InputChoice {
        &self.values.input
    }

    pub fn set_input(&mut self, choice: InputChoice) -> Result<(), SettingsError> {
        self.values.input = choice;
        self.save()
    }

    pub fn server(&self) -> ServerSettings {
        ServerSettings {
            address: self.values.bind_address,
            port: self.values.port,
        }
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
