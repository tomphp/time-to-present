use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::engine::Word;

pub const VERSION: u32 = 1;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Request {
    Live {
        model: PathBuf,
        language: String,
    },
    Audio {
        pcm: String,
    },
    Transcribe {
        model: PathBuf,
        language: String,
        path: PathBuf,
        #[serde(default)]
        prompt: Option<String>,
    },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    Ready {
        protocol: u32,
    },
    Progress {
        percent: u8,
    },
    Words {
        from: usize,
        stable: usize,
        words: Vec<Word>,
    },
    NoSpeech,
    Error {
        message: String,
    },
    Done,
}
