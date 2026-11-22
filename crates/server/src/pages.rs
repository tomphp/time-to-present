use std::path::Path;
use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use percent_encoding::percent_decode_str;
use tower::ServiceExt;
use tower_http::services::ServeDir;

use crate::Shared;

const RESERVED: &str = "_ttp";
const APP: &str = "app";

const NO_PRESENTATION: &str = include_str!("../pages/no-presentation.html");
const NO_APP: &str = include_str!("../pages/no-app.html");

/// Serves the open Presentation's `app/`, except for the reserved `/_ttp/`, which it can never fill.
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

/// Judged on the first folder the file server would open: `.` and empty segments are skipped,
/// macOS and Windows match names whatever their case, and Windows also splits on `\` and
/// drops trailing dots and spaces.
fn is_reserved(path: &str) -> bool {
    let decoded = percent_decode_str(path).decode_utf8_lossy();
    let first = decoded
        .split(['/', '\\'])
        .map(|segment| segment.trim_end_matches(['.', ' ']))
        .find(|segment| !segment.is_empty());
    first.is_some_and(|segment| segment.eq_ignore_ascii_case(RESERVED))
}
