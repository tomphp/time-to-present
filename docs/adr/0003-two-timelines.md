# Two timelines: Recording Time and Script Time

Recording Time is the immutable position within a Recording's audio. Script Time is relative: each Word stores only a Gap and a duration, so absolute times are derived and every edit ripples through what follows. This lets a Word be moved, trimmed or deleted without ever rewriting audio or recomputing stored absolute times, while Trim keeps each Word's link back into its Recording accurate.
