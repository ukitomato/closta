//! How a saved record is opened to be read: through a file system port, never through a link, and never
//! more than a bounded part of it.

use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;

/// What a directory holds, as the reader needs to know it.
#[derive(Clone, PartialEq, Eq)]
pub struct RecordEntry {
    pub name: String,
    pub kind: EntryKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EntryKind {
    /// A regular file, not a link: its last change (ms since 1970, 0 before) and its size.
    File { modified_ms: i64, bytes: u64 },
    /// A directory, a link, or anything else that is not read as a record.
    Other,
    /// An entry that could not be looked at.
    Unreadable(io::ErrorKind),
}

// The name is the session's, so `Debug` shows only the kind and the size.
impl std::fmt::Debug for RecordEntry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.kind {
            EntryKind::File { bytes, .. } => write!(f, "RecordEntry(File, {bytes} bytes)"),
            EntryKind::Other => f.write_str("RecordEntry(Other)"),
            EntryKind::Unreadable(kind) => write!(f, "RecordEntry(Unreadable, {kind:?})"),
        }
    }
}

/// The only way the reader touches files, so tests can stand in a file system.
pub trait RecordFs: Send + Sync {
    /// What `dir` holds, seen without following links: name, whether it is a regular file, its last change
    /// (ms, 0 before 1970) and its size. A link to a directory given as `dir` is followed, like `read_dir`.
    fn entries(&self, dir: &Path) -> io::Result<Vec<RecordEntry>>;
    /// Whether `dir` is a directory (a link is followed).
    fn is_dir(&self, dir: &Path) -> bool;
    /// Opens `path` without going through a link. Anything but a regular file is an error.
    fn open(&self, path: &Path) -> io::Result<Box<dyn RecordFile>>;
    /// `dir` with its links resolved, or `None` when it cannot be.
    fn real_path(&self, dir: &str) -> Option<String>;
}

#[allow(
    clippy::len_without_is_empty,
    reason = "the size can fail, and nothing asks whether a record is empty"
)]
pub trait RecordFile: Read + Seek + Send {
    fn len(&self) -> io::Result<u64>;
}

/// The bytes of a record from `reader`, and whether the oldest part of it was left unread.
pub(crate) struct Opened {
    pub reader: BufReader<Box<dyn RecordFile>>,
    pub oldest_unread: bool,
}

/// Opens `path` to be read from its first line, or from the first whole line of its newest `max_bytes` when it
/// is bigger. The lines before were never read, so they cannot be counted: the caller says older ones were
/// left out.
pub(crate) fn open_tail(fs: &dyn RecordFs, path: &Path, max_bytes: u64) -> io::Result<Opened> {
    let mut file = fs.open(path)?;
    let len = file.len()?;
    let cut = len > max_bytes;
    if cut {
        file.seek(SeekFrom::Start(len - max_bytes))?;
    }
    let mut reader = BufReader::new(file);
    // The first line of the part read began before it: what is left of it is not a line.
    if cut {
        skip_line(&mut reader)?;
    }
    Ok(Opened {
        reader,
        oldest_unread: cut,
    })
}

/// Opens `path` to read its first lines only (a title), through no link.
pub(crate) fn open_head(fs: &dyn RecordFs, path: &Path) -> io::Result<Box<dyn RecordFile>> {
    fs.open(path)
}

fn skip_line(reader: &mut impl BufRead) -> io::Result<()> {
    loop {
        let buffer = match reader.fill_buf() {
            Ok(buffer) => buffer,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        };
        if buffer.is_empty() {
            return Ok(());
        }
        match buffer.iter().position(|&b| b == b'\n') {
            Some(at) => {
                reader.consume(at + 1);
                return Ok(());
            }
            None => {
                let all = buffer.len();
                reader.consume(all);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::fake::record_fs::MemoryRecordFs;
    use std::io::Read;

    fn read_all(opened: Opened) -> (String, bool) {
        let mut text = String::new();
        let mut reader = opened.reader;
        reader.read_to_string(&mut text).unwrap();
        (text, opened.oldest_unread)
    }

    fn fs_with(bytes: &[u8]) -> MemoryRecordFs {
        let fs = MemoryRecordFs::default();
        fs.put("/p/a.jsonl", bytes.to_vec(), 1);
        fs
    }

    fn tail(bytes: &[u8], max: u64) -> (String, bool) {
        let fs = fs_with(bytes);
        read_all(open_tail(&fs, Path::new("/p/a.jsonl"), max).unwrap())
    }

    #[test]
    fn a_record_within_the_limit_is_read_whole() {
        assert_eq!(
            tail(b"aaaa\nbbbb\n", 10),
            ("aaaa\nbbbb\n".to_string(), false)
        );
        assert_eq!(
            tail(b"aaaa\nbbbb\n", 100),
            ("aaaa\nbbbb\n".to_string(), false)
        );
    }

    #[test]
    fn a_big_record_is_read_from_the_first_whole_line_of_its_newest_part() {
        assert_eq!(tail(b"aaaa\nbbbb\ncccc\n", 7), ("cccc\n".to_string(), true));
    }

    #[test]
    fn a_cut_at_a_line_start_still_skips_one_line() {
        assert_eq!(
            tail(b"aaaa\nbbbb\ncccc\n", 10),
            ("cccc\n".to_string(), true)
        );
    }

    #[test]
    fn a_cut_inside_a_character_skips_that_whole_line() {
        let text = "あいう\nok\n";
        // "あ" 0..3, "い" 3..6: cutting 4 bytes in leaves the tail of "い".
        let max = text.len() as u64 - 4;
        assert_eq!(tail(text.as_bytes(), max), ("ok\n".to_string(), true));
    }

    #[test]
    fn a_cut_with_no_newline_after_it_leaves_nothing() {
        assert_eq!(tail(b"aaaa\nbbbb", 3), (String::new(), true));
    }

    #[test]
    fn a_link_is_not_opened() {
        let fs = MemoryRecordFs::default();
        fs.put("/outside/x.jsonl", b"secret\n".to_vec(), 1);
        fs.link("/p/a.jsonl", "/outside/x.jsonl");
        assert!(open_head(&fs, Path::new("/p/a.jsonl")).is_err());
        assert!(open_tail(&fs, Path::new("/p/a.jsonl"), 100).is_err());
    }

    #[test]
    fn the_head_of_a_record_is_read_from_its_first_byte() {
        let fs = fs_with(b"first\nsecond\n");
        let mut text = String::new();
        open_head(&fs, Path::new("/p/a.jsonl"))
            .unwrap()
            .read_to_string(&mut text)
            .unwrap();
        assert_eq!(text, "first\nsecond\n");
    }
}
