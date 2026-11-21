use std::fmt;
use std::io;

use tokio::net::TcpListener;
use ttp_core::settings::ServerSettings;

/// The configured port was taken, so the server listens on another.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PortNotice {
    pub(crate) wanted: u16,
    pub(crate) bound: u16,
}

impl fmt::Display for PortNotice {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Port {} is in use, so the Presentation App is on port {}",
            self.wanted, self.bound
        )
    }
}

/// Port 0 asks the system for any free port.
pub(crate) async fn listen(
    settings: ServerSettings,
) -> io::Result<(TcpListener, Option<PortNotice>)> {
    let mut port = settings.port;
    loop {
        match TcpListener::bind((settings.address, port)).await {
            Ok(listener) => {
                let bound = listener.local_addr()?.port();
                let notice = (settings.port != 0 && bound != settings.port).then_some(PortNotice {
                    wanted: settings.port,
                    bound,
                });
                return Ok((listener, notice));
            }
            Err(error) if error.kind() == io::ErrorKind::AddrInUse && port < u16::MAX => {
                port += 1;
            }
            Err(error) => return Err(error),
        }
    }
}
