use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::Shared;

pub(crate) const PATH: &str = "/_ttp/v1/script";

pub(crate) async fn script(State(shared): State<Arc<Shared>>) -> Response {
    match shared.session.lock().unwrap().as_ref() {
        Some(session) => Json(session.script()).into_response(),
        None => (StatusCode::SERVICE_UNAVAILABLE, "No presentation open").into_response(),
    }
}
