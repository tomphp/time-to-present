use std::io;
use std::process::ExitCode;

use ttp_stt_sidecar::fake::FakeLoader;

fn main() -> ExitCode {
    ttp_stt_sidecar::serve(&FakeLoader, io::stdin().lock(), io::stdout().lock())
}
