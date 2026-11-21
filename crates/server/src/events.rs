use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use futures_util::stream::{self, StreamExt};
use ttp_core::clock::StreamEvent;

use crate::Shared;
use crate::hub::Subscription;

pub(crate) const PATH: &str = "/_ttp/v1/events";
const RETRY: Duration = Duration::from_millis(1000);

/// The Snapshot is taken and the broadcast joined under the Session's lock, which every
/// broadcast also holds, so a connection neither misses an event nor sees one twice.
pub(crate) async fn stream(State(shared): State<Arc<Shared>>) -> Response {
    let joined = {
        let mut open = shared.session.lock().unwrap();
        open.as_mut().map(|session| {
            let snapshot = StreamEvent::Snapshot(session.snapshot());
            (shared.hub.frame(&snapshot), shared.hub.subscribe())
        })
    };
    let Some((snapshot, subscription)) = joined else {
        return (StatusCode::SERVICE_UNAVAILABLE, "No presentation open").into_response();
    };
    let first = stream::once(async move { Ok(snapshot.event().retry(RETRY)) });
    Sse::new(first.chain(stream::unfold(Some(subscription), next)))
        .keep_alive(KeepAlive::default())
        .into_response()
}

/// A connection that falls behind is ended, so that it reconnects from a fresh Snapshot.
async fn next(
    subscription: Option<Subscription>,
) -> Option<(Result<Event, Infallible>, Option<Subscription>)> {
    let mut subscription = subscription?;
    let frame = subscription.frames.recv().await.ok()?;
    let rest = (!frame.ends_stream).then_some(subscription);
    Some((Ok(frame.event()), rest))
}
