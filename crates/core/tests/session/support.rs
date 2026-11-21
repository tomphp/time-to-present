use std::path::{Path, PathBuf};
use std::sync::Arc;

use tempfile::TempDir;
use ttp_core::session::{Session, SessionState};
use ttp_core::store::StoreError;
use ttp_core::time::{Ms, TimeSource};

pub struct ManualTime(Ms);

impl TimeSource for ManualTime {
    fn now(&self) -> Ms {
        self.0
    }
}

pub struct Harness {
    temp: TempDir,
}

impl Harness {
    pub fn new() -> Self {
        Self {
            temp: TempDir::new().unwrap(),
        }
    }

    pub fn parent(&self) -> &Path {
        self.temp.path()
    }

    pub fn with_fixture(name: &str) -> (Self, PathBuf) {
        let harness = Self::new();
        let folder = harness.parent().join(name);
        std::fs::create_dir(&folder).unwrap();
        let source = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name);
        for entry in std::fs::read_dir(source).unwrap() {
            let entry = entry.unwrap();
            std::fs::copy(entry.path(), folder.join(entry.file_name())).unwrap();
        }
        (harness, folder)
    }

    pub fn time(&self) -> Arc<dyn TimeSource> {
        Arc::new(ManualTime(0))
    }

    pub fn create(&self, title: &str) -> Session {
        Session::create(self.parent(), title, self.time()).unwrap()
    }

    pub fn create_error(&self, title: &str) -> StoreError {
        Session::create(self.parent(), title, self.time())
            .err()
            .unwrap()
    }

    pub fn open(&self, folder: &Path) -> Session {
        Session::open(folder, self.time()).unwrap()
    }

    pub fn open_error(&self, folder: &Path) -> StoreError {
        Session::open(folder, self.time()).err().unwrap()
    }
}

pub fn word_starts(state: &SessionState) -> Vec<(&str, &str, Ms)> {
    state
        .words
        .iter()
        .map(|w| (w.word.id.as_str(), w.word.text.as_str(), w.start))
        .collect()
}
