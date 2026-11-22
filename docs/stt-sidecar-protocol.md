# STT sidecar protocol

The core runs speech-to-text in a separate process, `ttp-stt-sidecar`, and talks to it in JSON lines:
one JSON object per line on stdin (requests) and on stdout (events). Every engine speaks this
protocol, so a later one (a forced aligner, a native streaming engine) replaces whisper.cpp without
touching the core. See [ADR 0002](adr/0002-whisper-cpp-sidecar.md).

One process runs one session, in one of two modes:

- **Live:** the Live Transcript while recording. PCM goes in, revisable Words come out.
- **Transcription:** the accurate pass over a finished Recording. A file path goes in, progress and
  timed Words come out.

stderr is free-form engine logging, not part of the protocol. The process exits 0 after `done` and
1 after `error`.

## Requests

The first request picks the mode.

### `live`

```json
{"type": "live", "model": "/…/models/ggml-base.en.bin", "language": "en"}
```

Then any number of `audio` requests:

```json
{"type": "audio", "pcm": "<base64>"}
```

`pcm` is 16 kHz mono 16-bit little-endian PCM, whole samples only. Send it in chunks of about
500 ms: the sidecar decodes once every 500 ms of audio, so smaller chunks wait for the rest of the
step and larger ones are decoded once. Close stdin to end the session: the sidecar decodes what is
left, settles every Word, and sends `done`.

### `transcribe`

```json
{"type": "transcribe", "model": "/…/models/ggml-large-v3-turbo.bin", "language": "en", "path": "/…/recordings/r1.wav", "prompt": "The quick brown fox."}
```

`path` is a WAV of any rate, depth and channel count: the sidecar mixes it down and resamples to
16 kHz itself. `prompt` is optional: text the speaker is expected to say, such as the Script text a
Re-record replaces. whisper.cpp takes it as its initial prompt, and a forced aligner would align to
it. Nothing more is read from stdin.

### Fields

- `model`: the path of the model file. whisper.cpp takes ggml models; their DTW alignment heads are
  picked from the file name (`ggml-<name>.bin`, optionally with a `-q…` quantisation suffix). A
  name with no preset falls back to plain token timestamps, with a note on stderr.
- `language`: an ISO 639-1 code. Only `en` is accepted in v1; any other is an `error`.

## Events

### `ready`

```json
{"type": "ready", "protocol": 1}
```

The model is loaded and the session has started. Always the first event, unless the request or the
model is refused. `protocol` is this protocol's version.

### `words`

```json
{"type": "words", "from": 3, "stable": 2, "words": [
  {"text": "brown", "start": 620, "end": 960, "confidence": 0.93}
]}
```

The Words heard so far, as an edit to the list the session has sent before:

1. Drop every Word at index `from` or later.
2. Append `words`.
3. The first `stable` Words are settled: no later event changes them.

`from` is never less than the previous `stable`, so a settled Word is never revised. An event may
change only `stable`, with empty `words`. `start` and `end` are integer milliseconds from the start
of the session's audio (Recording Time in Transcription mode). `text` carries its punctuation.
`confidence` is 0 to 1.

In live mode, Words are revised as more audio arrives. A Word settles once the 5 s window is full and
the Word ended at least 1 s before the end of the window. The window then slides past it, and every
Word settles when stdin closes. In Transcription mode there is one `words` event with `from` 0
and every Word settled.

### `progress`

```json
{"type": "progress", "percent": 40}
```

Transcription mode only. Each value is higher than the last, and the last is 100, sent before
`words` or `no_speech`.

### `no_speech`

```json
{"type": "no_speech"}
```

The session heard no Words. Sent instead of `words` in Transcription mode, and in live mode when
stdin closes with nothing heard. It is followed by `done`.

### `error`

```json
{"type": "error", "message": "unsupported language \"fr\": only \"en\" is available"}
```

The session failed and the process exits 1. It is the last event. Errors are a malformed or
unexpected request, an unsupported language, a model that will not load (before `ready`), an
unreadable recording, and an engine failure (after `ready`, following any Words already sent).
`message` is for people, not for matching.

### `done`

```json
{"type": "done"}
```

The session ended cleanly. It is the last event.

## A live session

```text
→ {"type":"live","model":"…/ggml-base.en.bin","language":"en"}
← {"type":"ready","protocol":1}
→ {"type":"audio","pcm":"…"}                       0.0–0.5 s
← {"type":"words","from":0,"stable":0,"words":[{"text":"The","start":100,…},{"text":"quick",…}]}
→ {"type":"audio","pcm":"…"}                       0.5–1.0 s
← {"type":"words","from":1,"stable":0,"words":[{"text":"quick",…},{"text":"brown",…}]}
   (stdin closed)
← {"type":"words","from":3,"stable":3,"words":[]}
← {"type":"done"}
```

## Building and testing

`cargo test` runs the protocol suite against `ttp-stt-fake`, a build of the same binary with a fake
engine that hears runs of constant sample values as Words. No model or whisper.cpp is needed.

whisper.cpp is behind the `whisper` feature (`metal` adds the GPU) and needs `cmake`. Built without
it, the sidecar answers every session with an `error`. `scripts/build-sidecar.mjs` builds the
release sidecar, with Metal on macOS and on the CPU elsewhere, and stages it in
`apps/desktop/src-tauri/binaries/` for Tauri's `externalBin`.
`npm run dev` and the release build run it first. Building `apps/desktop/src-tauri` on its own
needs it staged.

Not yet applied from the whisper research: Silero VAD, which needs a second model download. The
live pass relies on whisper's own no-speech handling until the on-Mac spike measures whether VAD is
needed.

The slow test runs real whisper.cpp on a spoken fixture:

```sh
cargo test -p ttp-stt-sidecar --features metal -- --ignored
```

It uses the model at `TTP_WHISPER_MODEL`, or else the `base.en` the app downloads.
