use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use sha2::{Digest, Sha256};

pub const LIVE_MODEL: &str = "base.en";
pub const TRANSCRIPTION_MODEL: &str = "large-v3-turbo";

const CHUNK: usize = 64 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum ModelError {
    #[error("unknown speech model \"{0}\"")]
    Unknown(String),
    #[error("could not download the speech model: {0}")]
    Download(String),
    #[error("the downloaded {name} model failed its checksum and was deleted")]
    ChecksumMismatch { name: String },
    #[error("{0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub struct ModelSpec {
    pub name: String,
    pub url: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Progress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

impl Progress {
    /// The share downloaded, once the total is known.
    pub fn percent(&self) -> Option<u8> {
        let total = self.total?;
        Some((self.downloaded * 100 / total.max(1)).min(100) as u8)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct InstalledModel {
    pub name: String,
    pub bytes: u64,
}

pub fn whisper_catalog() -> Vec<ModelSpec> {
    let model = |name: &str, sha256: &str| ModelSpec {
        name: name.into(),
        url: format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{name}.bin"),
        sha256: sha256.into(),
    };
    vec![
        model(
            "base.en",
            "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
        ),
        model(
            "small.en",
            "c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d",
        ),
        model(
            "large-v3-turbo",
            "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
        ),
    ]
}

/// Downloads speech models on first use into one folder and lists or removes them.
pub struct ModelManager {
    dir: PathBuf,
    catalog: Vec<ModelSpec>,
    downloading: Mutex<()>,
}

impl ModelManager {
    pub fn new(dir: PathBuf, catalog: Vec<ModelSpec>) -> Self {
        Self {
            dir,
            catalog,
            downloading: Mutex::new(()),
        }
    }

    /// Returns the model's file, downloading it first when it is not installed.
    /// Concurrent callers wait for the one download in progress.
    pub fn ensure(
        &self,
        name: &str,
        on_progress: impl FnMut(Progress),
    ) -> Result<PathBuf, ModelError> {
        let spec = self.spec(name)?;
        let path = self.path(spec);
        if path.is_file() {
            return Ok(path);
        }
        let _turn = self
            .downloading
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !path.is_file() {
            fs::create_dir_all(&self.dir)?;
            self.download(spec, &path, on_progress)?;
        }
        Ok(path)
    }

    pub fn installed(&self) -> Result<Vec<InstalledModel>, ModelError> {
        let mut installed = Vec::new();
        for spec in &self.catalog {
            if let Ok(metadata) = fs::metadata(self.path(spec)) {
                installed.push(InstalledModel {
                    name: spec.name.clone(),
                    bytes: metadata.len(),
                });
            }
        }
        Ok(installed)
    }

    pub fn remove(&self, name: &str) -> Result<(), ModelError> {
        match fs::remove_file(self.path(self.spec(name)?)) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.into()),
            _ => Ok(()),
        }
    }

    fn spec(&self, name: &str) -> Result<&ModelSpec, ModelError> {
        self.catalog
            .iter()
            .find(|spec| spec.name == name)
            .ok_or_else(|| ModelError::Unknown(name.into()))
    }

    fn path(&self, spec: &ModelSpec) -> PathBuf {
        self.dir.join(format!("ggml-{}.bin", spec.name))
    }

    fn download(
        &self,
        spec: &ModelSpec,
        path: &PathBuf,
        on_progress: impl FnMut(Progress),
    ) -> Result<(), ModelError> {
        let partial = path.with_extension("bin.part");
        let outcome = fetch(spec, &partial, on_progress)
            .and_then(|()| fs::rename(&partial, path).map_err(ModelError::from));
        if outcome.is_err() {
            let _ = fs::remove_file(&partial);
        }
        outcome
    }
}

fn fetch(
    spec: &ModelSpec,
    partial: &PathBuf,
    mut on_progress: impl FnMut(Progress),
) -> Result<(), ModelError> {
    let mut response = ureq::get(&spec.url)
        .call()
        .map_err(|error| ModelError::Download(error.to_string()))?;
    let total = response.body().content_length();
    let mut reader = response.body_mut().as_reader();
    let mut file = File::create(partial)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0; CHUNK];
    let mut downloaded = 0;
    on_progress(Progress { downloaded, total });
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| ModelError::Download(error.to_string()))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])?;
        hasher.update(&buffer[..read]);
        downloaded += read as u64;
        on_progress(Progress { downloaded, total });
    }
    file.sync_all()?;
    if hex::encode(hasher.finalize()) != spec.sha256 {
        return Err(ModelError::ChecksumMismatch {
            name: spec.name.clone(),
        });
    }
    Ok(())
}
