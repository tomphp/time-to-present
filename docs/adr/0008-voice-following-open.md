# Live voice-following is out of v1 but must not be blocked

The Teleprompter tracking what the presenter actually says is not built in v1, but every module keeps it possible. Words have stable ids, Trim keeps Recording Time links accurate, and Named Events are anchored to Words, so live speech can be aligned to Words. The capture path from core to sidecar and the sidecar protocol are the ones a live follower would use. Every client renders from the core's clock, so following only adds new `clock` causes (for example `follow`) to the existing stream.
