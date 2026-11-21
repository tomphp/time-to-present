# The Fold as the primary client model

A Presentation App derives its state as a pure function of the Named Events passed by the current Script Time, rebuilt from the Snapshot and advanced by each live event. Seeking backward or forward, joining late and reconnecting then all give the correct state with no special handling; raw per-event hooks exist but are documented as not seek-safe.
