# Presentation Size is saved in the Presentation, not per machine

The Presentation Size is written to `presentation.json`, while the Performance Layout and the displays stay in the per-machine settings. A vertical Presentation for Shorts and a landscape talk each open at their own shape on any machine, without the presenter changing a setting between them. The trade-off is that a machine no longer remembers one size for every Presentation, and that the size is the one Perform setting that is not per machine, which is surprising next to the others.

It is hard to reverse because it is part of the folder format (ADR 0006). There is no format version bump: a `presentation.json` without `presentationSize` reads as 1920×1080, and an older app ignores the field, so a Presentation edited by an older app falls back to 1920×1080. The size an older version kept in the machine settings is ignored, not migrated into any Presentation.
