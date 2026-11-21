use std::io::{Error, ErrorKind, Result};
use std::path::Path;

const RIFF_HEADER: usize = 8;
const CHUNK_HEADER: usize = 8;

/// Sets the RIFF and `data` sizes of a WAV that was never finalized to the bytes on disk.
pub fn fix_header(path: &Path) -> Result<()> {
    let mut bytes = std::fs::read(path)?;
    let data = data_chunk(&bytes).ok_or_else(|| Error::new(ErrorKind::InvalidData, "not a WAV"))?;
    let riff_size = (bytes.len() - RIFF_HEADER) as u32;
    let data_size = (bytes.len() - data - CHUNK_HEADER) as u32;
    if read_u32(&bytes, 4) == riff_size && read_u32(&bytes, data + 4) == data_size {
        return Ok(());
    }
    bytes[4..8].copy_from_slice(&riff_size.to_le_bytes());
    bytes[data + 4..data + CHUNK_HEADER].copy_from_slice(&data_size.to_le_bytes());
    std::fs::write(path, bytes)
}

fn data_chunk(bytes: &[u8]) -> Option<usize> {
    if bytes.get(..4)? != b"RIFF" || bytes.get(8..12)? != b"WAVE" {
        return None;
    }
    let mut at = 12;
    while at + CHUNK_HEADER <= bytes.len() {
        if &bytes[at..at + 4] == b"data" {
            return Some(at);
        }
        at += CHUNK_HEADER + read_u32(bytes, at + 4) as usize;
    }
    None
}

fn read_u32(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap())
}
