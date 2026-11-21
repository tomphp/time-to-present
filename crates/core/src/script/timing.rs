use super::Word;
use crate::time::Ms;

const SHORTEST_WORD: Ms = 10;

pub fn move_by(word: &mut Word, by: Ms) {
    word.gap = (word.gap + by).max(0);
}

/// Keeps the Word's end where it is.
pub fn trim_start(word: &mut Word, by: Ms) {
    let earliest = -word.gap.min(word.audio_start.unwrap_or(Ms::MAX));
    let latest = word.duration.min(audio_length(word)) - SHORTEST_WORD;
    let by = within(by, earliest, latest);
    word.gap += by;
    word.duration -= by;
    word.audio_start = word.audio_start.map(|start| start + by);
}

pub fn trim_end(word: &mut Word, by: Ms) {
    let earliest = SHORTEST_WORD - word.duration.min(audio_length(word));
    let by = within(by, earliest, Ms::MAX);
    word.duration += by;
    word.audio_end = word.audio_end.map(|end| end + by);
}

fn audio_length(word: &Word) -> Ms {
    word.audio_start
        .zip(word.audio_end)
        .map_or(Ms::MAX, |(start, end)| end - start)
}

/// Clamps a change to its limits, always allowing no change at all.
fn within(by: Ms, earliest: Ms, latest: Ms) -> Ms {
    by.clamp(earliest.min(0), latest.max(0))
}
