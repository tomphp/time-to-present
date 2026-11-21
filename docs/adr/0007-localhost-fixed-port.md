# Localhost-only server on a fixed default port

The server binds to 127.0.0.1 on port 4747, falling back to the next free port with a notice if it is taken. Presentation Apps and the Presentation Window use the same origin, so a stable port keeps URLs, bookmarks and dev-server proxies predictable, while loopback-only binding avoids exposing the Performance to the network. The bind address stays an internal setting so LAN access can be added later.
