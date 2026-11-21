use std::path::Path;
use std::sync::Arc;

use axum::Json;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use percent_encoding::percent_decode_str;
use tower::ServiceExt;
use tower_http::services::ServeDir;

use crate::Shared;

pub(crate) const SCRIPT_PATH: &str = "/_ttp/v1/script";
const RESERVED: &str = "_ttp";
const APP: &str = "app";

const NO_PRESENTATION: &str = include_str!("../pages/no-presentation.html");
const NO_APP: &str = include_str!("../pages/no-app.html");

pub(crate) async fn script(State(shared): State<Arc<Shared>>) -> Response {
    match shared.session.lock().unwrap().as_ref() {
        Some(session) => Json(session.script()).into_response(),
        None => (StatusCode::SERVICE_UNAVAILABLE, "No presentation open").into_response(),
    }
}

/// Serves the open Presentation's `app/`, except for the reserved `/_ttp/`, which the app
/// can never fill.
pub(crate) async fn app(State(shared): State<Arc<Shared>>, request: Request) -> Response {
    let path = request.uri().path();
    if is_reserved(path) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let is_root = path == "/";
    let app = {
        let open = shared.session.lock().unwrap();
        open.as_ref().map(|session| session.folder().join(APP))
    };
    match app {
        None if is_root => Html(NO_PRESENTATION).into_response(),
        Some(app) if !app.is_dir() && is_root => Html(NO_APP).into_response(),
        Some(app) if app.is_dir() => match ServeDir::new(app).oneshot(request).await {
            Ok(served) => served.into_response(),
            Err(infallible) => match infallible {},
        },
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

/// What the presenter is told when their build put files where they will never be served.
pub(crate) fn shadow_warning(folder: &Path) -> Option<String> {
    folder.join(APP).join(RESERVED).exists().then(|| {
        "app/_ttp/ is never served: /_ttp/ is reserved for Time to Present, so move those files"
            .to_string()
    })
}

fn is_reserved(path: &str) -> bool {
    let decoded = percent_decode_str(path).decode_utf8_lossy();
    let first = decoded.trim_start_matches('/').split('/').next();
    first == Some(RESERVED)
}
