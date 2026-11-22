use whisper_rs::{WhisperSegment, WhisperState, WhisperTokenId};

use crate::words::{Segment, Token};

/// Reads the decoded segments' timed tokens. whisper marks a token without a
/// DTW time with a negative `t_dtw`.
pub fn read(state: &WhisperState, end_of_text: WhisperTokenId) -> Vec<Segment> {
    state
        .as_iter()
        .map(|segment| Segment {
            tokens: tokens(&segment, end_of_text),
            end: segment.end_timestamp(),
        })
        .collect()
}

fn tokens(segment: &WhisperSegment, end_of_text: WhisperTokenId) -> Vec<Token> {
    (0..segment.n_tokens())
        .filter_map(|i| segment.get_token(i))
        .map(|token| {
            let data = token.token_data();
            Token {
                text: token.to_bytes().unwrap_or_default().to_vec(),
                probability: data.p,
                t0: data.t0,
                t1: data.t1,
                dtw: (data.t_dtw >= 0).then_some(data.t_dtw),
                special: token.token_id() >= end_of_text,
            }
        })
        .collect()
}
