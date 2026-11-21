use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use tempfile::TempDir;
use ttp_core::models::{ModelManager, ModelSpec};

pub struct FakeSource {
    base_url: String,
    requests: Arc<AtomicUsize>,
}

impl FakeSource {
    pub fn serving(file: &str, body: Vec<u8>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(AtomicUsize::new(0));
        let (file, counter) = (format!("/{file}"), requests.clone());
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut reader = BufReader::new(stream);
                let mut request_line = String::new();
                reader.read_line(&mut request_line).unwrap();
                let mut header = String::new();
                while reader.read_line(&mut header).is_ok_and(|n| n > 2) {
                    header.clear();
                }
                let mut stream = reader.into_inner();
                if request_line.split(' ').nth(1) == Some(file.as_str()) {
                    counter.fetch_add(1, Ordering::SeqCst);
                    let head = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = stream.write_all(head.as_bytes());
                    let _ = stream.write_all(&body);
                } else {
                    let _ = stream.write_all(
                        b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    );
                }
            }
        });
        Self { base_url, requests }
    }

    pub fn requests(&self) -> usize {
        self.requests.load(Ordering::SeqCst)
    }
}

pub fn manager_with(source: &FakeSource, name: &str, sha256: String) -> (TempDir, ModelManager) {
    let dir = TempDir::new().unwrap();
    let spec = ModelSpec {
        name: name.into(),
        url: format!("{}/ggml-{name}.bin", source.base_url),
        sha256,
    };
    let models = ModelManager::new(dir.path().to_path_buf(), vec![spec]);
    (dir, models)
}
