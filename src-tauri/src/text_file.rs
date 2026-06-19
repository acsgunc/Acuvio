//! Editable text-file I/O for normal-sized files.
//!
//! Unlike [`crate::log_file::LogFile`], which memory-maps multi-gigabyte logs
//! for read-only viewing, this module reads a whole (small) file into a String
//! so it can be edited in the frontend and written back. Memory-mapping is
//! deliberately avoided here: an active mmap would lock the file on Windows and
//! prevent saving over it.

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::log_file::detect_encoding;

/// The largest file Acuvio will open in editable mode. Larger files fall back
/// to the read-only memory-mapped viewer.
pub const MAX_EDIT_BYTES: u64 = 50 * 1024 * 1024; // 50 MiB

/// A file loaded for editing. `content` always uses `\n` line separators; the
/// original line ending is reported separately so it can be restored on save.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    pub content: String,
    pub encoding: String,
    /// Detected line ending: `"lf"`, `"crlf"`, or `"cr"`.
    pub eol: String,
    pub size: u64,
}

/// Read a file into memory as editable text. Fails for files larger than
/// [`MAX_EDIT_BYTES`] so the caller can fall back to the log viewer.
pub fn open_text(path: impl AsRef<Path>) -> Result<TextFile, String> {
    let path = path.as_ref();
    let meta = fs::metadata(path).map_err(|e| friendly(path, &e))?;
    if meta.is_dir() {
        return Err("path is a directory, not a file".into());
    }
    let size = meta.len();
    if size > MAX_EDIT_BYTES {
        return Err(format!(
            "file is too large to edit ({size} bytes); open it in the viewer instead"
        ));
    }

    let bytes = fs::read(path).map_err(|e| friendly(path, &e))?;
    let encoding = detect_encoding(&bytes);
    let eol = detect_eol(&bytes).to_string();
    // Decode as UTF-8 (lossy) and normalize all line endings to `\n`.
    let raw = String::from_utf8_lossy(&bytes);
    let content = raw.replace("\r\n", "\n").replace('\r', "\n");

    Ok(TextFile {
        content,
        encoding,
        eol,
        size,
    })
}

/// Write `content` to `path`, applying the requested line ending (`eol` is one
/// of `"lf"`, `"crlf"`, `"cr"`). Returns the number of bytes written.
pub fn save_text(path: impl AsRef<Path>, content: &str, eol: &str) -> Result<u64, String> {
    let path = path.as_ref();
    // `content` arrives with `\n` separators; expand to the requested ending.
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    let out = match eol {
        "crlf" => normalized.replace('\n', "\r\n"),
        "cr" => normalized.replace('\n', "\r"),
        _ => normalized,
    };
    fs::write(path, out.as_bytes()).map_err(|e| friendly(path, &e))?;
    Ok(out.len() as u64)
}

/// Detect the dominant line ending in a byte slice.
fn detect_eol(bytes: &[u8]) -> &'static str {
    let mut crlf = 0u64;
    let mut lf = 0u64;
    let mut cr = 0u64;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' => {
                if bytes.get(i + 1) == Some(&b'\n') {
                    crlf += 1;
                    i += 2;
                    continue;
                }
                cr += 1;
            }
            b'\n' => lf += 1,
            _ => {}
        }
        i += 1;
    }
    if crlf >= lf && crlf >= cr && crlf > 0 {
        "crlf"
    } else if cr > lf && cr > 0 {
        "cr"
    } else {
        "lf"
    }
}

fn friendly(path: &Path, e: &std::io::Error) -> String {
    use std::io::ErrorKind;
    let p = path.display();
    match e.kind() {
        ErrorKind::NotFound => format!("File not found: {p}"),
        ErrorKind::PermissionDenied => format!("Permission denied: {p}"),
        _ => format!("I/O error on {p}: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_crlf() {
        assert_eq!(detect_eol(b"a\r\nb\r\nc"), "crlf");
    }

    #[test]
    fn detects_lf() {
        assert_eq!(detect_eol(b"a\nb\nc"), "lf");
    }

    #[test]
    fn detects_cr() {
        assert_eq!(detect_eol(b"a\rb\rc"), "cr");
    }

    #[test]
    fn roundtrip_normalizes_and_restores_eol() {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "acuvio_text_{}.txt",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&p, b"one\r\ntwo\r\n").unwrap();

        let tf = open_text(&p).unwrap();
        assert_eq!(tf.content, "one\ntwo\n");
        assert_eq!(tf.eol, "crlf");

        save_text(&p, "alpha\nbeta\n", "crlf").unwrap();
        let written = std::fs::read(&p).unwrap();
        assert_eq!(written, b"alpha\r\nbeta\r\n");

        let _ = std::fs::remove_file(&p);
    }
}
