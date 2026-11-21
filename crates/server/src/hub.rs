use std::sync::atomic::{AtomicU64, Ordering};

use axum::response::sse::Event;
use tokio::sync::{broadcast, watch};
use ttp_core::clock::StreamEvent;

/// How far a connection may fall behind before it is dropped to reconnect from a Snapshot.
const CAPACITY: usize = 1024;

/// One event of the stream, serialised once for every connection.
#[derive(Debug, Clone)]
pub(crate) struct Frame {
    id: u64,
    name: String,
    data: String,
    pub(crate) ends_stream: bool,
}

impl Frame {
    pub(crate) fn event(&self) -> Event {
        Event::default()
            .id(self.id.to_string())
            .event(&self.name)
            .data(&self.data)
    }
}

/// The broadcast every connection joins, numbering frames for debugging only: nothing is replayed.
pub(crate) struct Hub {
    frames: broadcast::Sender<Frame>,
    sequence: AtomicU64,
    connected: watch::Sender<usize>,
}

impl Default for Hub {
    fn default() -> Self {
        Self {
            frames: broadcast::Sender::new(CAPACITY),
            sequence: AtomicU64::new(0),
            connected: watch::Sender::new(0),
        }
    }
}

impl Hub {
    pub(crate) fn frame(&self, event: &StreamEvent) -> Frame {
        let value = serde_json::to_value(event).expect("stream events always serialise");
        Frame {
            id: self.sequence.fetch_add(1, Ordering::SeqCst) + 1,
            name: value["type"].as_str().unwrap_or_default().to_string(),
            data: value.to_string(),
            ends_stream: matches!(event, StreamEvent::Closed { .. }),
        }
    }

    pub(crate) fn send(&self, event: &StreamEvent) {
        let _ = self.frames.send(self.frame(event));
    }

    pub(crate) fn subscribe(&self) -> Subscription {
        self.connected.send_modify(|connected| *connected += 1);
        Subscription {
            frames: self.frames.subscribe(),
            connected: self.connected.clone(),
        }
    }

    pub(crate) fn connected_apps(&self) -> usize {
        *self.connected.borrow()
    }

    pub(crate) fn watch_connected(&self) -> watch::Receiver<usize> {
        self.connected.subscribe()
    }
}

/// One connection's place in the broadcast; it counts as a connected app until dropped.
pub(crate) struct Subscription {
    pub(crate) frames: broadcast::Receiver<Frame>,
    connected: watch::Sender<usize>,
}

impl Drop for Subscription {
    fn drop(&mut self) {
        self.connected.send_modify(|connected| *connected -= 1);
    }
}
