# Event stream protocol (version 1)

For clients that don't use `@time-to-present/client`: a non-JS display, a native app, a
script. Time to Present serves a read-only event stream and the Script over HTTP on
`localhost:4747` (the editor's toolbar shows the port if 4747 was taken). Only the
Teleprompter and editor control the clock; clients only follow it.

| Path | What it is |
| --- | --- |
| `GET /_ttp/v1/events` | Server-Sent Events: the stream |
| `GET /_ttp/v1/script` | The Script as JSON |
| `GET /` and the rest | The open Presentation's `app/` folder (`/_ttp/` itself is reserved) |

Both `/_ttp/v1/` paths answer `503` while no Presentation is open.

## Connecting

Open `/_ttp/v1/events` as an `EventSource`. The SSE `event:` field is the event `type` and
`data:` is a JSON object that also carries `type`. The server sends `retry: 1000` and
keep-alive comments. If the connection drops, reconnect: every connection starts with a Snapshot,
so nothing is replayed and nothing needs resuming. Ignore the SSE `id`; it is for debugging.

Check `protocolVersion` in the first Snapshot. If it isn't the version you implement, stop and
tell the user to install matching software.

## Events

All times are integer ms of Script Time. `speed` is a factor from 0.50 to 2.00.

| `type` | Fields | Sent |
| --- | --- | --- |
| `snapshot` | `protocolVersion`, `scriptVersion`, `clock`, `currentWord`, `passedEvents` | On connect, after every seek, and after a Script edit |
| `clock` | `state`, `scriptTime`, `speed`, `cause` | On every clock change |
| `tick` | `scriptTime` | Ten times a second while playing |
| `word` | `id`, `text`, `start`, `duration` | As each Word starts |
| `namedEvent` | `id`, `name`, `data`, `scriptTime` | As each Named Event fires |
| `closed` | `reason` | The Presentation closed; the server then ends the stream |

`clock.state` is `ready`, `playing`, `paused` or `ended`. `cause` is `play`, `pause`, `seek`,
`speed`, `end` or `reset`; later versions add causes (voice-following), so treat unknown
ones as a plain clock change. `currentWord` is the Word being spoken, else the last started,
else `null`. `passedEvents` are every Named Event at or before the clock, in firing order.
A Named Event's `data` is whatever JSON the author gave it, or `null`.

```
event: snapshot
data: {"type":"snapshot","protocolVersion":1,"scriptVersion":1,"clock":{"state":"playing","scriptTime":1000,"speed":1.0},"currentWord":{"id":"w3","text":"three.","start":1000,"duration":300},"passedEvents":[{"id":"e1","name":"slide","data":{"index":1},"scriptTime":0}]}

event: namedEvent
data: {"type":"namedEvent","id":"e3","name":"flash","data":null,"scriptTime":1500}
```

## Seek safety

A seek sends one Snapshot and nothing else: skipped Named Events and Words are never
replayed. So derive state from the Snapshot, not from the live events alone:

1. On each `snapshot`, rebuild your state from `passedEvents` in order, from your initial state.
2. On each `namedEvent`, step that state forward.

Anything done only in response to a live `namedEvent` is wrong after a seek or a late join.
Use live events only for one-shot effects (an animation) and play them only when the
change came from a live event rather than a Snapshot.

## Time between events

Don't wait for ticks to move smoothly. Keep the last `scriptTime` and the local time you got it
(from a `clock`, `tick` or `snapshot`), and while `state` is `playing` extrapolate
`scriptTime + (localNow - at) * speed`. Never step back while playing; re-anchor on every
clock, tick and Snapshot. Pause on `closed`.

## Closed

On `closed` the clock has stopped where it was and the stream ends. Keep your last state,
show a waiting state if you like, and reconnect as for any drop. Once a Presentation is open
again the next connection starts with a Snapshot.

## The Script

`GET /_ttp/v1/script`:

```json
{
  "protocolVersion": 1,
  "scriptVersion": 1,
  "scriptEnd": 1500,
  "words": [{ "id": "w1", "text": "One", "start": 200, "duration": 300, "breakAfter": "line" }],
  "namedEvents": [{ "id": "e1", "name": "slide", "data": { "index": 1 }, "scriptTime": 0 }]
}
```

`words` are in Script order and `namedEvents` in firing order, at absolute Script Times.
`breakAfter` is optional (`line` or `paragraph`). Refetch whenever a Snapshot's
`scriptVersion` changes, which happens when the author edits the Script.
