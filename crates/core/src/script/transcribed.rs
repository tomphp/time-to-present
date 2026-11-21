use super::passage::APPEND_GAP;
use super::{Ids, Script, Word};
use crate::time::Ms;
use crate::transcription::HeardWord;

const LONGEST_LEAD_IN: Ms = 2_000;

impl Script {
    /// Splices a Transcription's Words in before the Word at `index`, or at the end. Inner Gaps
    /// come from the audio; the Seam Gap is the next Word's, 500 ms when appending, or the
    /// measured Lead-in (capped at 2 s) into an empty Script.
    pub fn insert_passage(
        &mut self,
        index: usize,
        recording_id: &str,
        heard: &[HeardWord],
        ids: &mut Ids,
    ) {
        let Some(first) = heard.first() else {
            return;
        };
        let seam_gap = match self.words.get(index) {
            Some(next) => next.gap,
            None if self.words.is_empty() => first.start.min(LONGEST_LEAD_IN),
            None => APPEND_GAP,
        };
        let mut previous_end = first.start - seam_gap;
        let words: Vec<Word> = heard
            .iter()
            .map(|word| {
                let gap = (word.start - previous_end).max(0);
                previous_end = word.end;
                spoken(ids.next_word(), recording_id, word, gap)
            })
            .collect();
        self.words.splice(index..index, words);
    }
}

fn spoken(id: String, recording_id: &str, heard: &HeardWord, gap: Ms) -> Word {
    Word {
        id,
        text: heard.text.clone(),
        gap,
        duration: (heard.end - heard.start).max(0),
        recording_id: Some(recording_id.to_string()),
        audio_start: Some(heard.start),
        audio_end: Some(heard.end),
        confidence: Some(heard.confidence),
        break_after: None,
    }
}
