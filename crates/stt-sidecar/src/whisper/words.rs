use whisper_rs::{WhisperSegment, WhisperState, WhisperTokenId};

use crate::engine::Word;

/// Joins whisper's sub-word tokens into Words: a token starting with a space
/// starts a new Word. Special tokens and bracketed annotations such as
/// `[BLANK_AUDIO]` are dropped.
pub fn from_tokens(state: &WhisperState, end_of_text: WhisperTokenId) -> Vec<Word> {
    let mut words: Vec<WordInProgress> = Vec::new();
    for segment in state.as_iter() {
        for token in tokens(&segment, end_of_text) {
            match words.last_mut() {
                Some(word) if !token.bytes.starts_with(b" ") => word.extend(token),
                _ => words.push(WordInProgress::from(token)),
            }
        }
    }
    words
        .into_iter()
        .filter_map(WordInProgress::into_word)
        .collect()
}

struct Token {
    bytes: Vec<u8>,
    start: i64,
    end: i64,
    probability: f32,
}

fn tokens(segment: &WhisperSegment, end_of_text: WhisperTokenId) -> Vec<Token> {
    (0..segment.n_tokens())
        .filter_map(|i| segment.get_token(i))
        .filter(|token| token.token_id() < end_of_text)
        .map(|token| {
            let data = token.token_data();
            Token {
                bytes: token.to_bytes().unwrap_or_default().to_vec(),
                start: if data.t_dtw >= 0 { data.t_dtw } else { data.t0 },
                end: data.t1,
                probability: data.p,
            }
        })
        .collect()
}

struct WordInProgress {
    bytes: Vec<u8>,
    start: i64,
    end: i64,
    probabilities: Vec<f32>,
}

impl From<Token> for WordInProgress {
    fn from(token: Token) -> Self {
        Self {
            bytes: token.bytes,
            start: token.start,
            end: token.end,
            probabilities: vec![token.probability],
        }
    }
}

impl WordInProgress {
    fn extend(&mut self, token: Token) {
        self.bytes.extend(token.bytes);
        self.end = token.end;
        self.probabilities.push(token.probability);
    }

    fn into_word(self) -> Option<Word> {
        let text = String::from_utf8_lossy(&self.bytes).trim().to_owned();
        if text.is_empty() || is_annotation(&text) {
            return None;
        }
        let centiseconds = |t: i64| t.max(0) as u64 * 10;
        Some(Word {
            text,
            start: centiseconds(self.start),
            end: centiseconds(self.end.max(self.start)),
            confidence: self.probabilities.iter().sum::<f32>() / self.probabilities.len() as f32,
        })
    }
}

fn is_annotation(text: &str) -> bool {
    (text.starts_with('[') && text.ends_with(']')) || (text.starts_with('(') && text.ends_with(')'))
}
