use std::time::Duration;

use futures_util::StreamExt;
use futures_util::stream::BoxStream;
use serde_json::Value;

pub const PATIENCE: Duration = Duration::from_secs(5);

/// One SSE message as it came over the wire.
#[derive(Debug, Clone, PartialEq)]
pub struct Message {
    pub event: String,
    pub id: Option<u64>,
    pub retry: Option<u64>,
    pub data: Value,
}

/// An SSE connection read message by message.
pub struct Events {
    pub status: reqwest::StatusCode,
    body: BoxStream<'static, reqwest::Result<bytes::Bytes>>,
    buffered: String,
}

impl Events {
    pub async fn connect(url: &str) -> Self {
        let response = reqwest::get(url).await.unwrap();
        Self {
            status: response.status(),
            body: response.bytes_stream().boxed(),
            buffered: String::new(),
        }
    }

    /// The next message, skipping keep-alive comments, or None once the stream has ended.
    pub async fn next(&mut self) -> Option<Message> {
        loop {
            if let Some(end) = self.buffered.find("\n\n") {
                let block: String = self.buffered.drain(..end + 2).collect();
                if let Some(message) = parse(&block) {
                    return Some(message);
                }
                continue;
            }
            let chunk = tokio::time::timeout(PATIENCE, self.body.next())
                .await
                .expect("the stream went quiet");
            match chunk {
                Some(bytes) => self
                    .buffered
                    .push_str(&String::from_utf8_lossy(&bytes.unwrap())),
                None => return None,
            }
        }
    }

    pub async fn expect(&mut self) -> Message {
        self.next().await.expect("the stream ended")
    }

    pub async fn expect_end(&mut self) {
        if let Some(message) = self.next().await {
            panic!("expected the stream to end, got {message:?}");
        }
    }
}

fn parse(block: &str) -> Option<Message> {
    let mut message = Message {
        event: "message".into(),
        id: None,
        retry: None,
        data: Value::Null,
    };
    let mut data = None;
    for line in block.lines() {
        let Some((field, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.strip_prefix(' ').unwrap_or(value);
        match field {
            "event" => message.event = value.into(),
            "id" => message.id = Some(value.parse().unwrap()),
            "retry" => message.retry = Some(value.parse().unwrap()),
            "data" => data = Some(serde_json::from_str(value).unwrap()),
            _ => {}
        }
    }
    message.data = data?;
    Some(message)
}
