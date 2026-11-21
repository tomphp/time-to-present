# Protocol fixtures

Language-neutral JSON fixtures shared by the Rust core and the client library's
Simulator. Each fixture is a Script, a sequence of clock actions at given times,
and the exact event stream they must produce. Both suites run every fixture here,
so the two implementations can't drift.
