use super::{EditError, Word};
use crate::time::Ms;

pub fn split(first: &mut Word, at: usize, second_id: String) -> Result<Word, EditError> {
    let length = first.text.chars().count();
    if at == 0 || at >= length {
        return Err(EditError::InvalidSplit { at, length });
    }
    let share = at as f64 / length as f64;
    let first_duration = proportion(first.duration, share);
    let audio_split = first
        .audio_start
        .zip(first.audio_end)
        .map(|(start, end)| start + proportion(end - start, share));
    let second = Word {
        id: second_id,
        text: first.text.chars().skip(at).collect(),
        gap: 0,
        duration: first.duration - first_duration,
        recording_id: first.recording_id.clone(),
        audio_start: audio_split,
        audio_end: first.audio_end,
        confidence: None,
        break_after: first.break_after.take(),
    };
    first.text = first.text.chars().take(at).collect();
    first.duration = first_duration;
    first.audio_end = audio_split;
    first.confidence = None;
    Ok(second)
}

pub fn merge(first: &mut Word, second: Word) {
    first.text.push_str(&second.text);
    first.duration += second.gap + second.duration;
    if first.recording_id.is_some() && first.recording_id == second.recording_id {
        first.audio_end = second.audio_end;
    }
    first.confidence = None;
    first.break_after = second.break_after;
}

/// Removes the Words `deleted` picks out. Each surviving Word after a deleted run keeps the
/// longer of its own Gap and the run's first Gap, so everything after ripples earlier.
pub fn delete(words: &mut Vec<Word>, deleted: impl Fn(&Word) -> bool) {
    let mut run_gap: Option<Ms> = None;
    words.retain_mut(|word| {
        if deleted(word) {
            run_gap.get_or_insert(word.gap);
            return false;
        }
        if let Some(gap) = run_gap.take() {
            word.gap = word.gap.max(gap);
        }
        true
    });
}

fn proportion(amount: Ms, share: f64) -> Ms {
    (amount as f64 * share).round() as Ms
}
