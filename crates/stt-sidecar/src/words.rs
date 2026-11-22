use crate::engine::Word;

/// whisper's resolution, for a Word whose timing source gives it no length.
const SHORTEST_WORD_CENTISECONDS: i64 = 1;

/// A decoded segment of a Transcription. Times are whisper's centiseconds.
pub struct Segment {
    pub tokens: Vec<Token>,
    pub end: i64,
}

pub struct Token {
    pub text: Vec<u8>,
    pub probability: f32,
    pub t0: i64,
    pub t1: i64,
    pub dtw: Option<i64>,
    pub special: bool,
}

/// Joins sub-word tokens into Words: a token starting with a space starts a
/// new Word. Special tokens and bracketed annotations such as `[BLANK_AUDIO]`
/// are dropped.
///
/// Every Word is timed from one source: DTW when every text token has a DTW
/// time, plain token timestamps otherwise.
pub fn join(segments: &[Segment]) -> Vec<Word> {
    let timing = Timing::of(segments);
    let mut words: Vec<WordInProgress> = Vec::new();
    for segment in segments {
        for (index, token) in segment.tokens.iter().enumerate() {
            if token.special {
                continue;
            }
            let end = timing.end(segment, index);
            match words.last_mut() {
                Some(word) if !token.text.starts_with(b" ") => word.extend(token, end),
                _ => words.push(WordInProgress::new(token, timing.start(token), end)),
            }
        }
    }
    words
        .into_iter()
        .filter_map(WordInProgress::into_word)
        .collect()
}

#[derive(Clone, Copy)]
enum Timing {
    Dtw,
    Plain,
}

impl Timing {
    /// whisper.cpp gives DTW times to text tokens only.
    fn of(segments: &[Segment]) -> Self {
        let mut text = segments
            .iter()
            .flat_map(|segment| &segment.tokens)
            .filter(|token| !token.special);
        if text.all(|token| token.dtw.is_some()) {
            Self::Dtw
        } else {
            Self::Plain
        }
    }

    fn start(self, token: &Token) -> i64 {
        match self {
            Self::Dtw => token.dtw.expect("every text token has a DTW time"),
            Self::Plain => token.t0,
        }
    }

    /// A DTW token ends where the next one in its segment starts, counting
    /// tokens dropped as text.
    fn end(self, segment: &Segment, index: usize) -> i64 {
        match self {
            Self::Dtw => segment.tokens[index + 1..]
                .iter()
                .find_map(|token| token.dtw)
                .unwrap_or(segment.end),
            Self::Plain => segment.tokens[index].t1,
        }
    }
}

struct WordInProgress {
    bytes: Vec<u8>,
    start: i64,
    end: i64,
    probabilities: Vec<f32>,
}

impl WordInProgress {
    fn new(token: &Token, start: i64, end: i64) -> Self {
        Self {
            bytes: token.text.clone(),
            start,
            end,
            probabilities: vec![token.probability],
        }
    }

    fn extend(&mut self, token: &Token, end: i64) {
        self.bytes.extend(&token.text);
        self.end = end;
        self.probabilities.push(token.probability);
    }

    fn into_word(self) -> Option<Word> {
        let text = String::from_utf8_lossy(&self.bytes).trim().to_owned();
        if text.is_empty() || is_annotation(&text) {
            return None;
        }
        let start = self.start.max(0);
        let end = self.end.max(start + SHORTEST_WORD_CENTISECONDS);
        let milliseconds = |centiseconds: i64| centiseconds as u64 * 10;
        Some(Word {
            text,
            start: milliseconds(start),
            end: milliseconds(end),
            confidence: self.probabilities.iter().sum::<f32>() / self.probabilities.len() as f32,
        })
    }
}

fn is_annotation(text: &str) -> bool {
    (text.starts_with('[') && text.ends_with(']')) || (text.starts_with('(') && text.ends_with(')'))
}
