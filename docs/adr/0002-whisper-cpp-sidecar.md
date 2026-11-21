# whisper.cpp as a JSON-lines sidecar in two modes

Speech-to-text runs as a separate whisper.cpp process that reads audio and writes JSON lines, in two modes: a live pass over a sliding window producing revisable words, and a post-recording Transcription with a larger model producing a start and end per Word. One engine in two modes keeps shipping simple, is local and MIT-licensed, and the JSON-lines protocol lets a better engine (for example a forced aligner) replace it later without touching the core.
