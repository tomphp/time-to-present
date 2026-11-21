//! The event stream server: serves the open Presentation's app and its SSE stream on loopback.

use std::io;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::http::{HeaderValue, header};
use axum::routing::get;
use serde::Serialize;
use tokio::sync::watch;
use tokio::task::JoinHandle;
use tower_http::set_header::SetResponseHeaderLayer;
use ttp_core::session::Session;
use ttp_core::settings::ServerSettings;
use ttp_core::store::StoreError;

mod bind;
mod events;
mod hub;
mod pages;
mod script;

use bind::PortNotice;
use hub::Hub;

/// The one open Presentation, shared by the desktop app and the server, or None with nothing open.
pub type SharedSession = Arc<Mutex<Option<Session>>>;

struct Shared {
    session: SharedSession,
    hub: Hub,
}

pub struct Server {
    address: SocketAddr,
    notice: Option<PortNotice>,
    shared: Arc<Shared>,
    serving: JoinHandle<()>,
}

/// What the Performance Bar shows about the server.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub url: String,
    pub port_notice: Option<String>,
    pub shadow_warning: Option<String>,
    pub connected_apps: usize,
}

impl Server {
    /// Listens on the configured port, or the next free one after it, on the current runtime.
    pub async fn start(settings: ServerSettings, session: SharedSession) -> io::Result<Self> {
        let (listener, notice) = bind::listen(settings).await?;
        let shared = Arc::new(Shared {
            session,
            hub: Hub::default(),
        });
        let router = Router::new()
            .route(events::PATH, get(events::stream))
            .route(script::PATH, get(script::script))
            .fallback(pages::app)
            .layer(SetResponseHeaderLayer::if_not_present(
                header::CACHE_CONTROL,
                HeaderValue::from_static("no-cache"),
            ))
            .with_state(shared.clone());
        let address = listener.local_addr()?;
        let serving = tokio::spawn(async move {
            if let Err(error) = axum::serve(listener, router).await {
                eprintln!("the event stream server stopped: {error}");
            }
        });
        Ok(Self {
            address,
            notice,
            shared,
            serving,
        })
    }

    pub fn address(&self) -> SocketAddr {
        self.address
    }

    /// Makes `session` the open Presentation, streaming what it broadcasts to every connection,
    /// after closing the one open before it.
    pub fn open(&self, mut session: Session) -> Result<(), StoreError> {
        let shared = self.shared.clone();
        session.subscribe_stream(move |event| shared.hub.send(event));
        let mut open = self.shared.session.lock().unwrap();
        let closed = open.take().map_or(Ok(()), Session::close);
        *open = Some(session);
        closed
    }

    /// Closes the open Presentation, which ends every stream with a `closed` event.
    pub fn close(&self) -> Result<(), StoreError> {
        let mut open = self.shared.session.lock().unwrap();
        open.take().map_or(Ok(()), Session::close)
    }

    pub fn watch_connected_apps(&self) -> watch::Receiver<usize> {
        self.shared.hub.watch_connected()
    }

    /// Never call it while holding the Session's lock.
    pub fn status(&self) -> ServerStatus {
        let session = self.shared.session.lock().unwrap();
        ServerStatus {
            url: format!("http://localhost:{}/", self.address.port()),
            port_notice: self.notice.as_ref().map(PortNotice::to_string),
            shadow_warning: session
                .as_ref()
                .and_then(|session| pages::shadow_warning(session.folder())),
            connected_apps: self.shared.hub.connected_apps(),
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.serving.abort();
    }
}
