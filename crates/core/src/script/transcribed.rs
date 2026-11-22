use super::{Ids, Script, Word};
use crate::time::Ms;
use crate::transcription::HeardWord;

const LONGEST_LEAD_IN: Ms = 2_000;
const SHORTEST_SPOKEN_WORD: Ms = 80;

impl Script {
    /// The Words a Transcription becomes going in before the Word at `index`, or at the end.
    /// Inner Gaps come from the fitted audio, so they follow a Word grown into the silence
    /// around it. The Seam Gap is the next Word's, 500 ms when appending,
    /// or the measured Lead-in (capped at 2 s) into an empty Script.
    pub fn transcribed(
        &self,
        index: usize,
        recording_id: &str,
        heard: &[HeardWord],
        ids: &mut Ids,
    ) -> Vec<Word> {
        let spans = fitted(heard);
        let Some(first) = spans.first() else {
            return Vec::new();
        };
        let seam_gap = self.seam_gap(index, first.start.min(LONGEST_LEAD_IN));
        let mut previous_end = first.start - seam_gap;
        heard
            .iter()
            .zip(spans)
            .map(|(word, span)| {
                let gap = (span.start - previous_end).max(0);
                previous_end = span.end;
                spoken(ids.next_word(), recording_id, word, span, gap)
            })
            .collect()
    }
}

#[derive(Clone, Copy)]
struct Span {
    start: Ms,
    end: Ms,
}

/// Each heard Word's audio, lasting at least the shortest spoken Word: grown into the silence
/// after it, then the silence before it, and only then past the next Word's start.
fn fitted(heard: &[HeardWord]) -> Vec<Span> {
    let mut spans: Vec<Span> = Vec::with_capacity(heard.len());
    for (i, word) in heard.iter().enumerate() {
        let previous_end = spans.last().map_or(0, |previous| previous.end);
        spans.push(fit(word, heard.get(i + 1), previous_end));
    }
    spans
}

fn fit(word: &HeardWord, next: Option<&HeardWord>, previous_end: Ms) -> Span {
    let next_start = next.map_or(Ms::MAX, |next| next.start);
    let clamped_end = word.end.min(next_start).max(word.start);
    let grown_into_silence_after =
        clamped_end.max((word.start + SHORTEST_SPOKEN_WORD).min(next_start));
    let start = (grown_into_silence_after - SHORTEST_SPOKEN_WORD)
        .max(previous_end)
        .min(word.start);
    let pushed_past_next_start = grown_into_silence_after.max(start + SHORTEST_SPOKEN_WORD);
    Span {
        start,
        end: pushed_past_next_start,
    }
}

fn spoken(id: String, recording_id: &str, heard: &HeardWord, span: Span, gap: Ms) -> Word {
    Word {
        id,
        text: heard.text.clone(),
        gap,
        duration: span.end - span.start,
        recording_id: Some(recording_id.to_string()),
        audio_start: Some(span.start),
        audio_end: Some(span.end),
        confidence: Some(heard.confidence),
        break_after: None,
    }
}
