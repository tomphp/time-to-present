# Tauri v2 with a Rust core

The desktop app is built on Tauri v2. A Rust core owns microphone capture, the Performance clock, the HTTP/SSE server and speech-to-text hosting; webviews only render state published by the core. The hard parts of the app are all non-UI, a Rust core keeps the timing authority out of any webview, and a Rust core makes capture and streaming speech-to-text a natural fit for later voice-following.

The Desktop App is no longer macOS-only: it ships on macOS, Windows and Linux, and whisper.cpp uses Metal on macOS and the CPU elsewhere (ADR 0011).

## Considered Options

- **Electron**: the lowest-risk shell (one Chromium, mature web audio, Node HTTP), but a much larger bundle and no advantage once capture and the clock live in the core rather than a webview.
- **Pure Swift/SwiftUI**: the best macOS integration, but it makes a later Windows or Linux build a full rewrite, and the app's value is in its core and protocol rather than native UI.
