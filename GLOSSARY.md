# Time to Present

A desktop app for the whole presenting workflow: record a talk, edit its timing, mark Named Events, and perform it with a Teleprompter while a web app you built follows the same clock.

## Language

### Presentation and Script

**Presentation**:
One talk and everything that belongs to it: its Script, its Recordings, and the Presentation App built for it. One Presentation is open at a time.
_Avoid_: Project, deck, document

**Script**:
The ordered Words of a Presentation, with the Gaps between them and the Named Events anchored to them. It is the single timed text that every Performance plays.
_Avoid_: Transcript, timeline

**Word**:
One spoken or typed word of the Script, including its punctuation, with a stable identity, a Gap before it and a duration. A spoken Word also links back to the audio it came from.

**Gap**:
The silence, in milliseconds, between the end of the previous Word and the start of this one. Gaps, not absolute times, are what the Script stores, so changing one moves everything after it.
_Avoid_: Pause, delay

**Lead-in**:
The Gap of the first Word: the silence between Script Time 0 and the first Word.

**Named Event**:
A named, repeatable marker with optional JSON data, anchored to a Word (or to the start of the Script) and fired during a Performance at that point. It is how the Script drives the Presentation App.
_Avoid_: Cue, trigger, marker

**Script End**:
The moment the Script is over: the later of the last Word's end and the last Named Event.

**Sentence**:
A run of Words ending at one that finishes with `.`, `?` or `!`, or that has a line or paragraph break after it. It is the unit that backward seeks in the Teleprompter jump to.

### Recording

**Recording**:
One uninterrupted capture from Start to Stop, kept as an audio file that the Script's spoken Words point into. Recordings are never deleted automatically.
_Avoid_: Take. Takes are deliberately not a v1 concept: there is no choosing between alternative captures of the same passage, only Re-record.

**Recording Time**:
Positions within a Recording's audio. It is immutable: editing the Script never changes it.

**Live Transcript**:
The rough, provisional text shown while recording, revising itself as the presenter speaks. It never becomes part of the Script.
_Avoid_: Draft, captions

**Transcription**:
The accurate pass over a finished Recording that turns it into timed Words for the Script.

**Insertion Point**:
The caret position between Words where a new Recording lands, by default the end of the Script.

**Re-record**:
Recording over a selected range of Words. The range is replaced only when the Transcription arrives, as one undoable edit.

**Pending Passage**:
The locked placeholder in the Script for a stopped Recording whose Transcription has not landed yet. The rest of the Script stays editable.

**Seam Gap**:
The Gap given to the first Word of a new passage where it joins existing Words. It comes from the Script around it, not from the silence at the edges of the Recording.

### Editing

**Script Time**:
Positions within the Script, as if played start to finish. It is relative: derived by adding up Gaps and durations, so every edit ripples through everything after it.
_Avoid_: Timestamp, audio time

**Script Time timeline**:
The editor view that shows the Words and Named Events laid out along Script Time and lets you adjust their timing by dragging.

**Move**:
Dragging a Word along the timeline to change its Gap, which shifts everything after it.

**Trim**:
Dragging a Word's edge to cut into or extend the audio it uses. Trimming the start moves nothing after it; trimming the end shifts everything after.

**Retime**:
Scaling the durations and Gaps of a selection of Words by a percentage.

**Listen**:
Playing one Word's own Recording with a second of audio either side. It never touches the Performance clock.

**Preview**:
Playing the Script from the cursor on the shared clock, with highlight and sound. It sounds the Script as Audio Runs and always follows Script Time. Trim start inside a Run changes a Word's edges, not the sound. Only a clock the editor started sounds, so a Performance started elsewhere plays silently in the editor.

**Audio Run**:
A stretch of consecutive spoken Words whose audio follows on unbroken in one Recording, so Preview sounds it as one piece. Every edit that puts a seam in the audio ends one Run and starts the next.
_Avoid_: segment, chunk

**Moved badge**:
A temporary mark on a Named Event that the app re-anchored automatically (after a delete, merge, cut or Re-record), so you can review it. It lasts for the session and is never saved.

**Edit lock**:
The editor is read-only while the Performance clock is playing, whoever started it, and while a Recording is being captured: every Script command is refused until the clock pauses or ends and the Recording stops. Unlike a Pending Passage, it covers the whole Script.

### Performance and protocol

**Performance**:
Playing the Script in real time on one clock, while the Teleprompter and any Presentation App follow it. The presenter controls it from the keyboard or a clicker.

**Clock State**:
Which of four conditions the Performance clock is in: ready (at the start, nothing fired), playing, paused, or ended.

**Tick**:
A frequent time update sent to clients while the clock is playing, so they can stay in step.

**Snapshot**:
A complete picture of where the Performance is, sent whenever a client connects, the clock seeks, or the Script is edited. It replaces replaying events, so a client never reconstructs the past from history.

### Presentation App and Client

**Presentation App**:
The web app the presenter builds for a Presentation, served during a Performance and driven by its Named Events. It is separate from the Time to Present app itself.
_Avoid_: Slides, deck, front end

**Client**:
The library a Presentation App uses to connect to the Performance and receive its events and state.

**Fold**:
A pure function from the Named Events passed so far to application state, rebuilt from scratch on every Snapshot and stepped forward by each live event. It is the primary way to write a Presentation App, because seeking in either direction then always gives the right state.
_Avoid_: Event handler (handlers reacting to single events do not survive a seek)

**store**:
A small observable value in the Client that you can read at any time and subscribe to for changes. Everything stateful in the Client is one.

**Simulator**:
A stand-in for the Performance that runs a Script on an in-browser clock and emits the same protocol, so a Presentation App can be built and tested without the desktop app.

**protocol fixture**:
A language-neutral example of a Script, a series of clock actions, and the exact events they must produce. The core and the Simulator are both tested against the same ones so they cannot drift apart.

### Teleprompter

**Teleprompter**:
The view of the Script for the presenter to read from during a Performance, highlighting each Word at its recorded pace and scrolling with it.

**Teleprompter Window**:
The window that shows the Teleprompter, Fullscreen on the presenter's display when Perform opens it, and Windowed when they choose.

**Presentation Window**:
The window that shows the Presentation App to the audience; chrome-less while Fullscreen, with a title bar while Windowed.

**Fullscreen**:
A Performance window filling the whole of the display it is on, with no window chrome. The presenter switches each Performance window between Fullscreen and Windowed on its own.
_Avoid_: presentation mode, kiosk

**Windowed**:
A Performance window that is an ordinary window, with a title bar, that can be moved and resized.

**Fullscreen Hint**:
The short message the Teleprompter Window shows each time it goes Fullscreen. It says how to switch, then fades away. It never appears on the Presentation Window.

**Performance Layout**:
How the Performance is arranged on screen. There are three: **Two windows** (a Teleprompter Window and a Presentation Window on separate displays), **Combined** (Presentation App and Teleprompter side by side in one window), and **Teleprompter only**.

**Reading Line**:
The fixed height on the Teleprompter, about a third of the way down, where the current line is held as the text scrolls.

**Approach Cue**:
The fill in the next Word's underline during a Gap that shows how long until it is spoken.

**Long Gap**:
A Gap at or above a threshold (1.5 seconds by default), for which the Approach Cue becomes a bar with a whole-second countdown.

**Performance Bar**:
The slim status strip in the Teleprompter showing the clock state, elapsed and remaining time, progress with Named Event ticks, speed, and the connection to the Presentation App.
