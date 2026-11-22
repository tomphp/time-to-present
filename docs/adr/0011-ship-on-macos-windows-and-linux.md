# Ship on macOS, Windows and Linux, with macOS-only behaviour gated

The Desktop App is built, tested and released on macOS, Windows and Linux from one codebase. What only macOS has sits behind one platform module chosen with `cfg(target_os = "macos")`: the microphone prompt, keeping AppKit's Full Screen item out of the menu, and holding off App Nap during a Performance. Elsewhere the module falls back to granting the microphone without a prompt, leaving the menu alone and an inert activity, because neither Windows nor Linux asks, adds that item or throttles a foreground app the same way. whisper.cpp uses Metal on macOS and the CPU elsewhere. CI runs the whole suite on each OS, so the gating is tested by compiling and running the same session tests through the `Platform` seam rather than by tests of the fallbacks.

## Considered Options

- **Stay macOS-only**: the smallest surface to support, but it shuts out presenters on Windows and Linux when the core, the server and the webviews are already cross-platform.
- **A GPU backend on every OS** (Vulkan or CUDA for whisper.cpp): faster Transcription off macOS, but it adds drivers and build toolchains to CI and to every install for a speed-up the first release does not need.
