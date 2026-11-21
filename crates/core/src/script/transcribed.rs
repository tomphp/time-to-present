use super::{Ids, Script, Word};
use crate::time::Ms;
use crate::transcription::HeardWord;

const LONGEST_LEAD_IN: Ms = 2_000;

impl Script {
    /// The Words a Transcription becomes going in before the Word at `index`, or at the end.
    /// Inner Gaps come from the audio; the Seam Gap is the next Word's, 500 ms when appending,
    /// or the measured Lead-in (capped at 2 s) into an empty Script.
    pub fn transcribed(
        &self,
        index: usize,
        recording_id: &str,
        heard: &[HeardWord],
        ids: &mut Ids,
    ) -> Vec<Word> {
        let Some(first) = heard.first() else {
            return Vec::new();
        };
        let seam_gap = self.seam_gap(index, first.start.min(LONGEST_LEAD_IN));
        let mut previous_end = first.start - seam_gap;
        heard
            .iter()
            .map(|word| {
                let gap = (word.start - previous_end).max(0);
                previous_end = word.end;
                spoken(ids.next_word(), recording_id, word, gap)
            })
            .collect()
    }

    /// Splices transcribed Words in before the Word at `index`, or at the end.
    pub fn insert_transcribed(&mut self, index: usize, words: Vec<Word>) {
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
