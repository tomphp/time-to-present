# Server-push event stream with Snapshots

The core is the single source of truth for what the Performance has reached, and pushes it to every client over one read-only SSE stream. Every connection starts with a Snapshot, and a seek sends a Snapshot rather than replaying skipped events, so there is no event replay or server buffer. Clients therefore never reconstruct state from history, and only the Teleprompter and editor control the clock.
