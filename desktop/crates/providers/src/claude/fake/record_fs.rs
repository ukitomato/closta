//! An in-memory file system for the saved-record reader: directories, files with bytes and a time, links,
//! and the failures a test asks for.

use std::collections::BTreeMap;
use std::io::{self, Cursor, ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use crate::claude::history::record_files::{EntryKind, RecordEntry, RecordFile, RecordFs};

enum Node {
    Dir,
    File { bytes: Arc<[u8]>, modified_ms: i64 },
    Link { target: PathBuf },
    UnreadableDir(ErrorKind),
    UnreadableEntry(ErrorKind),
}

#[derive(Default)]
struct State {
    nodes: BTreeMap<PathBuf, Node>,
    open_failures: BTreeMap<PathBuf, ErrorKind>,
    real_paths: BTreeMap<String, String>,
    opens: usize,
}

const MAX_LINK_DEPTH: usize = 16;

impl State {
    fn make_parents(&mut self, path: &Path) {
        for parent in path.ancestors().skip(1) {
            if parent.as_os_str().is_empty() {
                break;
            }
            self.nodes.entry(parent.to_path_buf()).or_insert(Node::Dir);
        }
    }

    // The path with the links in its own name followed, like a directory given to `read_dir`.
    fn followed(&self, path: &Path) -> PathBuf {
        let mut at = path.to_path_buf();
        for _ in 0..MAX_LINK_DEPTH {
            match self.nodes.get(&at) {
                Some(Node::Link { target }) => at = target.clone(),
                _ => break,
            }
        }
        at
    }
}

/// A [`RecordFs`] held in memory. Paths are compared as `Path`s.
#[derive(Default)]
pub struct MemoryRecordFs {
    state: Mutex<State>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

impl MemoryRecordFs {
    fn insert(&self, path: &str, node: Node) {
        let mut state = lock(&self.state);
        state.make_parents(Path::new(path));
        state.nodes.insert(PathBuf::from(path), node);
    }

    /// A directory (and the ones above it).
    pub fn dir(&self, path: &str) {
        let mut state = lock(&self.state);
        state.make_parents(Path::new(path));
        state.nodes.insert(PathBuf::from(path), Node::Dir);
    }

    /// A regular file, with the directories above it.
    pub fn put(&self, path: &str, bytes: impl Into<Arc<[u8]>>, modified_ms: i64) {
        self.insert(
            path,
            Node::File {
                bytes: bytes.into(),
                modified_ms,
            },
        );
    }

    /// A link at `path` to `target`. As an entry it is `Other` and it is not opened; as a directory handed to
    /// `entries` or `is_dir` it is followed.
    pub fn link(&self, path: &str, target: &str) {
        self.insert(
            path,
            Node::Link {
                target: PathBuf::from(target),
            },
        );
    }

    /// A directory whose `entries` fail with `kind`.
    pub fn unreadable_dir(&self, path: &str, kind: ErrorKind) {
        self.insert(path, Node::UnreadableDir(kind));
    }

    /// An entry that `entries` lists as `Unreadable(kind)`.
    pub fn unreadable_entry(&self, path: &str, kind: ErrorKind) {
        self.insert(path, Node::UnreadableEntry(kind));
    }

    /// A file that is listed and sized but fails with `kind` when opened.
    pub fn fail_open(&self, path: &str, kind: ErrorKind) {
        lock(&self.state)
            .open_failures
            .insert(PathBuf::from(path), kind);
    }

    /// What `real_path(dir)` answers.
    pub fn set_real_path(&self, dir: &str, real: &str) {
        lock(&self.state)
            .real_paths
            .insert(dir.to_owned(), real.to_owned());
    }

    /// How many times `open` was called, failed ones too.
    pub fn opens(&self) -> usize {
        lock(&self.state).opens
    }
}

struct MemoryFile(Cursor<Arc<[u8]>>);

impl Read for MemoryFile {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.0.read(buf)
    }
}

impl Seek for MemoryFile {
    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
        self.0.seek(pos)
    }
}

impl RecordFile for MemoryFile {
    fn len(&self) -> io::Result<u64> {
        Ok(self.0.get_ref().len() as u64)
    }
}

impl RecordFs for MemoryRecordFs {
    fn entries(&self, dir: &Path) -> io::Result<Vec<RecordEntry>> {
        let state = lock(&self.state);
        let dir = state.followed(dir);
        match state.nodes.get(&dir) {
            Some(Node::Dir) => {}
            Some(Node::UnreadableDir(kind)) => return Err((*kind).into()),
            Some(_) => return Err(ErrorKind::NotADirectory.into()),
            None => return Err(ErrorKind::NotFound.into()),
        }
        Ok(state
            .nodes
            .iter()
            .filter(|(path, _)| path.parent() == Some(dir.as_path()))
            .filter_map(|(path, node)| {
                let kind = match node {
                    Node::File { bytes, modified_ms } => EntryKind::File {
                        modified_ms: *modified_ms,
                        bytes: bytes.len() as u64,
                    },
                    Node::UnreadableEntry(kind) => EntryKind::Unreadable(*kind),
                    Node::Dir | Node::Link { .. } | Node::UnreadableDir(_) => EntryKind::Other,
                };
                Some(RecordEntry {
                    name: path.file_name()?.to_string_lossy().into_owned(),
                    kind,
                })
            })
            .collect())
    }

    fn is_dir(&self, dir: &Path) -> bool {
        let state = lock(&self.state);
        matches!(
            state.nodes.get(&state.followed(dir)),
            Some(Node::Dir | Node::UnreadableDir(_))
        )
    }

    fn open(&self, path: &Path) -> io::Result<Box<dyn RecordFile>> {
        let mut state = lock(&self.state);
        state.opens += 1;
        if let Some(kind) = state.open_failures.get(path) {
            return Err((*kind).into());
        }
        match state.nodes.get(path) {
            Some(Node::File { bytes, .. }) => {
                Ok(Box::new(MemoryFile(Cursor::new(Arc::clone(bytes)))))
            }
            Some(Node::UnreadableEntry(kind)) => Err((*kind).into()),
            Some(_) => Err(ErrorKind::InvalidInput.into()),
            None => Err(ErrorKind::NotFound.into()),
        }
    }

    fn real_path(&self, dir: &str) -> Option<String> {
        lock(&self.state).real_paths.get(dir).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::history::record_files::{EntryKind, RecordFs};
    use std::io::ErrorKind;
    use std::path::Path;

    fn names(fs: &MemoryRecordFs, dir: &str) -> Vec<(String, String)> {
        let mut out: Vec<_> = fs
            .entries(Path::new(dir))
            .unwrap()
            .into_iter()
            .map(|e| (e.name, format!("{:?}", e.kind)))
            .collect();
        out.sort();
        out
    }

    #[test]
    fn the_memory_file_system_lists_what_it_holds() {
        let fs = MemoryRecordFs::default();
        fs.put("/p/a.jsonl", b"12345".to_vec(), 42);
        fs.dir("/p/sub");
        fs.link("/p/l.jsonl", "/p/a.jsonl");
        fs.unreadable_entry("/p/bad.jsonl", ErrorKind::PermissionDenied);
        fs.put("/p/sub/deep.jsonl", b"x".to_vec(), 1);

        let mut entries = fs.entries(Path::new("/p")).unwrap();
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        let kinds: Vec<_> = entries.iter().map(|e| (e.name.as_str(), &e.kind)).collect();
        assert_eq!(
            kinds,
            vec![
                (
                    "a.jsonl",
                    &EntryKind::File {
                        modified_ms: 42,
                        bytes: 5
                    }
                ),
                (
                    "bad.jsonl",
                    &EntryKind::Unreadable(ErrorKind::PermissionDenied)
                ),
                ("l.jsonl", &EntryKind::Other),
                ("sub", &EntryKind::Other),
            ]
        );
        assert_eq!(names(&fs, "/p/sub").len(), 1);
        assert!(fs.is_dir(Path::new("/p")));
        assert!(!fs.is_dir(Path::new("/p/a.jsonl")));
        assert!(!fs.is_dir(Path::new("/nowhere")));
    }

    #[test]
    fn a_link_to_a_directory_is_a_directory_but_not_an_entry_to_read() {
        let fs = MemoryRecordFs::default();
        fs.put("/real/a.jsonl", b"1".to_vec(), 7);
        fs.link("/projects/name", "/real");
        assert!(fs.is_dir(Path::new("/projects/name")));
        assert_eq!(names(&fs, "/real"), names(&fs, "/projects/name"));
        let in_projects = fs.entries(Path::new("/projects")).unwrap();
        assert_eq!(in_projects.len(), 1);
        assert_eq!(in_projects[0].kind, EntryKind::Other);
        assert_eq!(fs.opens(), 0);
        assert_eq!(
            fs.open(Path::new("/projects/name")).err().map(|e| e.kind()),
            Some(ErrorKind::InvalidInput)
        );
        assert_eq!(fs.opens(), 1);
    }

    #[test]
    fn the_failures_a_test_asks_for_are_returned() {
        let fs = MemoryRecordFs::default();
        fs.put("/p/a.jsonl", b"1".to_vec(), 1);
        fs.unreadable_dir("/q", ErrorKind::PermissionDenied);
        fs.fail_open("/p/a.jsonl", ErrorKind::TimedOut);
        assert_eq!(
            fs.entries(Path::new("/q")).err().map(|e| e.kind()),
            Some(ErrorKind::PermissionDenied)
        );
        assert_eq!(
            fs.entries(Path::new("/missing")).err().map(|e| e.kind()),
            Some(ErrorKind::NotFound)
        );
        assert_eq!(
            fs.open(Path::new("/p/a.jsonl")).err().map(|e| e.kind()),
            Some(ErrorKind::TimedOut)
        );
        assert_eq!(fs.real_path("/p"), None);
        fs.set_real_path("/p", "/real/p");
        assert_eq!(fs.real_path("/p"), Some("/real/p".to_string()));
    }
}
