use std::net::TcpListener;

use ttp_server::{Server, SharedSession};

use crate::support::loopback;

#[tokio::test]
async fn the_configured_port_is_used_when_it_is_free_with_no_notice() {
    let free = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();

    let server = Server::start(loopback(free), SharedSession::default())
        .await
        .unwrap();

    assert_eq!(server.address().port(), free);
    let status = server.status();
    assert_eq!(status.url, format!("http://localhost:{free}/"));
    assert_eq!(status.port_notice, None);
}

#[tokio::test]
async fn a_taken_port_falls_back_to_the_next_free_one_with_a_notice() {
    let taken = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = taken.local_addr().unwrap().port();

    let server = Server::start(loopback(port), SharedSession::default())
        .await
        .unwrap();

    let bound = server.address().port();
    assert!(bound > port, "bound {bound} after {port}");
    let status = server.status();
    assert_eq!(status.url, format!("http://localhost:{bound}/"));
    let notice = status.port_notice.unwrap();
    assert!(
        notice.contains(&port.to_string()) && notice.contains(&bound.to_string()),
        "{notice}"
    );
    let reached = reqwest::get(format!("http://127.0.0.1:{bound}/"))
        .await
        .unwrap();
    assert_eq!(reached.status(), 200);
}

#[tokio::test]
async fn the_server_binds_only_the_configured_address() {
    let server = Server::start(loopback(0), SharedSession::default())
        .await
        .unwrap();

    assert!(server.address().ip().is_loopback());
}
