use super::Word;
use crate::time::Ms;

const FALLBACK_DURATION: Ms = 300;
const FALLBACK_GAP: Ms = 100;
const SHORTEST_TYPED: Ms = 150;
const LONGEST_TYPED: Ms = 1500;

/// A typed Word lasts its character count times the median ms per character of the spoken
/// Words, clamped, or 300 ms when nothing has been spoken.
pub fn typed_duration(words: &[Word], text: &str) -> Ms {
    let per_char =
        spoken(words).map(|word| word.duration as f64 / word.text.chars().count() as f64);
    match median(per_char) {
        Some(per_char) => {
            let estimate = (text.chars().count() as f64 * per_char).round() as Ms;
            estimate.clamp(SHORTEST_TYPED, LONGEST_TYPED)
        }
        None => FALLBACK_DURATION,
    }
}

/// The median Gap before the spoken Words after the first, or 100 ms when there are none.
pub fn median_gap(words: &[Word]) -> Ms {
    let gaps = spoken(&words[1.min(words.len())..]).map(|word| word.gap as f64);
    median(gaps).map_or(FALLBACK_GAP, |gap| gap.round() as Ms)
}

fn spoken(words: &[Word]) -> impl Iterator<Item = &Word> {
    words
        .iter()
        .filter(|word| word.recording_id.is_some() && !word.text.is_empty())
}

fn median(values: impl Iterator<Item = f64>) -> Option<f64> {
    let mut values: Vec<f64> = values.collect();
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    let middle = values.len() / 2;
    Some(if values.len() % 2 == 1 {
        values[middle]
    } else {
        (values[middle - 1] + values[middle]) / 2.0
    })
}
