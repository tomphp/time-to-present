## Install

Download the installer for your OS below. `checksums.txt` holds the SHA-256 of every installer.

- **macOS (Apple silicon):** the `.dmg`. The app is signed ad hoc and not notarised, so Gatekeeper
  blocks it. Clear the quarantine before opening the `.dmg`, then drag the app into Applications:
  `xattr -d com.apple.quarantine ~/Downloads/Time-to-Present_*.dmg`
- **Windows:** the `-setup.exe`. It is unsigned, so SmartScreen warns: choose More info, then Run
  anyway.
- **Linux (x86-64):** the `.AppImage` (`chmod +x` it, then run it; it needs `libfuse2`) or the
  `.deb` (`sudo apt install ./<file>.deb`).

**macOS asks for the microphone again after every update.** Each release has a new ad hoc
signature, and macOS ties the microphone grant to the signature. Allow the prompt again.

More in [the release docs](https://github.com/tomphp/time-to-present/blob/main/docs/release.md#install-a-release).
