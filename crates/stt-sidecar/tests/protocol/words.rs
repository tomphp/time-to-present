use ttp_stt_sidecar::Word;
use ttp_stt_sidecar::words::{Segment, Token, join};

fn plain(text: &str, t0: i64, t1: i64) -> Token {
    Token {
        text: text.as_bytes().to_vec(),
        probability: 1.0,
        t0,
        t1,
        dtw: None,
        special: false,
    }
}

fn timed(text: &str, dtw: i64) -> Token {
    Token {
        dtw: Some(dtw),
        ..plain(text, 0, 1000)
    }
}

fn special(dtw: Option<i64>) -> Token {
    Token {
        dtw,
        special: true,
        ..plain("[_TT_]", 0, 1000)
    }
}

fn segment(end: i64, tokens: Vec<Token>) -> Segment {
    Segment { tokens, end }
}

fn word(text: &str, start: u64, end: u64) -> Word {
    Word {
        text: text.into(),
        start,
        end,
        confidence: 1.0,
    }
}

#[test]
fn tokens_without_dtw_times_as_in_a_live_window_run_from_first_t0_to_last_t1() {
    let words = join(&[segment(
        90,
        vec![
            plain(" Hel", 10, 20),
            plain("lo", 22, 30),
            plain(" there", 40, 55),
        ],
    )]);

    assert_eq!(words, [word("Hello", 100, 300), word("there", 400, 550)]);
}

#[test]
fn dtw_timing_ends_a_word_where_the_next_token_in_its_segment_starts() {
    let words = join(&[
        segment(
            60,
            vec![timed(" Hel", 10), timed("lo", 20), timed(" there", 30)],
        ),
        segment(120, vec![timed(" friend", 70)]),
    ]);

    assert_eq!(
        words,
        [
            word("Hello", 100, 300),
            word("there", 300, 600),
            word("friend", 700, 1200),
        ]
    );
}

#[test]
fn a_dropped_token_still_marks_where_the_word_before_it_ends() {
    let words = join(&[segment(
        90,
        vec![
            timed(" Hello", 10),
            special(Some(25)),
            timed(" [BLANK_AUDIO]", 40),
            timed(" there", 70),
        ],
    )]);

    assert_eq!(words, [word("Hello", 100, 250), word("there", 700, 900)]);
}

#[test]
fn a_word_ends_at_the_next_token_that_has_a_dtw_time() {
    let words = join(&[segment(
        90,
        vec![timed(" Hello", 10), special(None), timed(" there", 40)],
    )]);

    assert_eq!(words, [word("Hello", 100, 400), word("there", 400, 900)]);
}

#[test]
fn a_transcription_missing_any_dtw_time_is_timed_by_plain_timestamps_throughout() {
    let words = join(&[
        segment(
            60,
            vec![Token {
                dtw: Some(5),
                ..plain(" Hello", 10, 30)
            }],
        ),
        segment(90, vec![plain(" there", 40, 80)]),
    ]);

    assert_eq!(words, [word("Hello", 100, 300), word("there", 400, 800)]);
}

#[test]
fn a_word_whose_dtw_times_are_equal_or_reversed_still_ends_after_it_starts() {
    let words = join(&[segment(
        20,
        vec![
            timed(" Hello", 30),
            timed(" there", 30),
            timed(" friend", 10),
        ],
    )]);

    assert_eq!(
        words,
        [
            word("Hello", 300, 310),
            word("there", 300, 310),
            word("friend", 100, 200),
        ]
    );
}

#[test]
fn a_word_whose_plain_timestamps_are_equal_still_ends_after_it_starts() {
    let words = join(&[segment(90, vec![plain(" Hello", 40, 40)])]);

    assert_eq!(words, [word("Hello", 400, 410)]);
}

#[test]
fn special_tokens_and_annotations_are_dropped() {
    let words = join(&[segment(
        90,
        vec![
            Token {
                special: true,
                ..plain("[_BEG_]", 0, 0)
            },
            plain(" [BLANK_AUDIO]", 0, 10),
            plain(" (music)", 10, 20),
            plain(" Hello", 20, 30),
            Token {
                special: true,
                ..plain("<|endoftext|>", 30, 30)
            },
        ],
    )]);

    assert_eq!(words, [word("Hello", 200, 300)]);
}

#[test]
fn a_words_confidence_is_the_mean_of_its_tokens_probabilities() {
    let words = join(&[segment(
        90,
        vec![
            Token {
                probability: 0.5,
                ..plain(" Hel", 10, 20)
            },
            Token {
                probability: 1.0,
                ..plain("lo", 20, 30)
            },
        ],
    )]);

    assert_eq!(words[0].confidence, 0.75);
}
