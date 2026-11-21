mod support;

use std::fs;

use sha2::{Digest, Sha256};
use support::{FakeSource, manager_with};
use ttp_core::models::{ModelError, Progress};

fn sha256(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

#[test]
fn a_download_reports_progress_and_stores_the_model() {
    let body = vec![7u8; 100_000];
    let source = FakeSource::serving("ggml-tiny.bin", body.clone());
    let (dir, models) = manager_with(&source, "tiny", sha256(&body));
    let mut seen: Vec<Progress> = Vec::new();

    let path = models
        .ensure("tiny", |progress| seen.push(progress))
        .unwrap();

    assert_eq!(fs::read(path).unwrap(), body);
    let last = seen.last().unwrap();
    assert_eq!((last.downloaded, last.total), (100_000, Some(100_000)));
    assert!(
        seen.windows(2)
            .all(|pair| pair[0].downloaded <= pair[1].downloaded)
    );
    assert!(fs::read_dir(dir.path()).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".part")
    }));
}

#[test]
fn a_checksum_mismatch_deletes_the_file_and_reports_an_error() {
    let source = FakeSource::serving("ggml-tiny.bin", b"corrupted".to_vec());
    let (dir, models) = manager_with(&source, "tiny", sha256(b"expected"));

    let result = models.ensure("tiny", |_| {});

    assert!(matches!(result, Err(ModelError::ChecksumMismatch { .. })));
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    assert!(models.installed().unwrap().is_empty());
}

#[test]
fn a_failed_download_leaves_nothing_behind() {
    let source = FakeSource::serving("other.bin", Vec::new());
    let (dir, models) = manager_with(&source, "tiny", sha256(b"x"));

    assert!(matches!(
        models.ensure("tiny", |_| {}),
        Err(ModelError::Download(_))
    ));
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn an_installed_model_is_not_downloaded_again() {
    let body = b"model".to_vec();
    let source = FakeSource::serving("ggml-tiny.bin", body.clone());
    let (_dir, models) = manager_with(&source, "tiny", sha256(&body));
    models.ensure("tiny", |_| {}).unwrap();

    models
        .ensure("tiny", |_| panic!("downloaded again"))
        .unwrap();

    assert_eq!(source.requests(), 1);
}

#[test]
fn an_unknown_model_is_refused() {
    let source = FakeSource::serving("ggml-tiny.bin", Vec::new());
    let (_dir, models) = manager_with(&source, "tiny", sha256(b""));

    assert!(matches!(
        models.ensure("../huge", |_| {}),
        Err(ModelError::Unknown(_))
    ));
    assert!(matches!(
        models.remove("../huge"),
        Err(ModelError::Unknown(_))
    ));
}

#[test]
fn installed_models_are_listed_with_sizes_and_can_be_removed() {
    let body = vec![1u8; 4096];
    let source = FakeSource::serving("ggml-tiny.bin", body.clone());
    let (_dir, models) = manager_with(&source, "tiny", sha256(&body));
    assert!(models.installed().unwrap().is_empty());
    models.ensure("tiny", |_| {}).unwrap();

    let installed = models.installed().unwrap();
    assert_eq!(
        (installed[0].name.as_str(), installed[0].bytes),
        ("tiny", 4096)
    );

    models.remove("tiny").unwrap();
    assert!(models.installed().unwrap().is_empty());
    models.remove("tiny").unwrap();
}

#[test]
fn concurrent_requests_for_one_model_download_it_once() {
    let body = vec![3u8; 50_000];
    let source = FakeSource::serving("ggml-tiny.bin", body.clone());
    let (_dir, models) = manager_with(&source, "tiny", sha256(&body));

    std::thread::scope(|scope| {
        for _ in 0..3 {
            scope.spawn(|| models.ensure("tiny", |_| {}).unwrap());
        }
    });

    assert_eq!(source.requests(), 1);
}
