# Protocol fixtures

Language-neutral JSON fixtures shared by the Rust core and the client library's
Simulator. Each fixture is a Script, a sequence of clock actions at given times,
and the exact event stream they must produce. Both suites run every fixture here,
so the two implementations can't drift.

## Format

```json
{
  "script": { "words": [...], "namedEvents": [...] },
  "steps": [ { "action": "play" }, { "action": "advance", "ms": 100 } ],
  "stream": [ { "type": "clock", "state": "playing", "scriptTime": 0, "speed": 1.0, "cause": "play" } ]
}
```

`script` is the `words` and `namedEvents` of a `presentation.json`. The clock starts
`ready` at Script Time 0 and 1.0×, on a Script at version 1, with no time passed.

`steps` run in order on the same clock:

| action    | fields       | what it does                                                        |
| --------- | ------------ | ------------------------------------------------------------------- |
| `advance` | `ms`         | wall time moves on by `ms`, then the clock runs once                |
| `connect` |              | a client connects: its first event, a Snapshot, joins the stream    |
| `play`    |              |                                                                     |
| `pause`   |              |                                                                     |
| `seek`    | `scriptTime` |                                                                     |
| `speed`   | `speed`      | a factor, taken to the nearest 0.05 step and clamped to 0.50–2.00   |
| `reset`   |              |                                                                     |
| `close`   |              | the Presentation closes; must be the last step                      |

`stream` is every event the steps produce, in order, exactly as the protocol sends
them. A number is equal whether written `1` or `1.0`.

## Rules the fixtures pin

- Every action first runs the clock up to the wall time of the action, so anything
  crossed since the last step goes out before the action's own event.
- `advance` ends with a `tick` when at least 100 ms of wall time has passed since
  the last tick or since play; a longer step (a stall) still gives one tick, after
  everything it crossed.
- Reaching Script End fires what is left, then `clock` with cause `end` and no tick.
- A seek sends a Snapshot and nothing else: what it skipped never replays, and what
  sits at or before the target counts as passed. `ready` and `ended` become `paused`;
  `playing` goes on from the target. A seek never ends the clock on its own, even at
  Script End: a playing clock ends on its next run, a paused one when it plays.
- A Named Event whose anchor and offset resolve before Script Time 0 fires at 0.
- `pause` and `reset` in `ready`, `play` in `playing` or `ended`, and a `speed` that
  lands on the speed already set all send nothing.
