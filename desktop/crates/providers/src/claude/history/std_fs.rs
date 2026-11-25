//! The records on the disk: what a directory holds and a record's bytes, never through a link.

use std::fs::{File, Metadata};
use std::io;
use std::path::Path;
use std::time::UNIX_EPOCH;

use super::record_files::{EntryKind, RecordEntry, RecordFile, RecordFs};

/// The real file system.
#[derive(Clone, Copy, Debug, Default)]
pub struct StdRecordFs;

impl RecordFs for StdRecordFs {
    fn entries(&self, dir: &Path) -> io::Result<Vec<RecordEntry>> {
        std::fs::read_dir(dir)?
            .map(|entry| {
                let entry = entry?;
                let kind = match std::fs::symlink_metadata(entry.path()) {
                    Ok(metadata) if metadata.is_file() => EntryKind::File {
                        modified_ms: modified_ms(&metadata),
                        bytes: metadata.len(),
                    },
                    Ok(_) => EntryKind::Other,
                    Err(error) => EntryKind::Unreadable(error.kind()),
                };
                Ok(RecordEntry {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    kind,
                })
            })
            .collect()
    }

    fn is_dir(&self, dir: &Path) -> bool {
        dir.is_dir()
    }

    // Looked at, then opened: the gap between is small, as only the user and the CLI write the place.
    fn open(&self, path: &Path) -> io::Result<Box<dyn RecordFile>> {
        if !std::fs::symlink_metadata(path)?.is_file() {
            return Err(io::ErrorKind::InvalidInput.into());
        }
        Ok(Box::new(File::open(path)?))
    }

    fn real_path(&self, dir: &str) -> Option<String> {
        let real = std::fs::canonicalize(dir).ok()?;
        let real = real.to_str()?;
        if cfg!(windows) {
            Some(strip_verbatim(real))
        } else {
            Some(real.to_owned())
        }
    }
}

/// The last change in ms since 1970, or 0 when it is before or cannot be read.
fn modified_ms(metadata: &Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|at| at.duration_since(UNIX_EPOCH).ok())
        .and_then(|since| i64::try_from(since.as_millis()).ok())
        .unwrap_or(0)
}

impl RecordFile for File {
    fn len(&self) -> io::Result<u64> {
        self.metadata().map(|it| it.len())
    }
}

/// `path` without the `\\?\` that Windows puts before the real path of a directory, so it is named as the
/// CLI names it: `\\?\UNC\server\x` is `\\server\x` and `\\?\C:\x` is `C:\x`.
pub fn strip_verbatim(path: &str) -> String {
    if let Some(share) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{share}")
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_owned()
    } else {
        path.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verbatim_prefixes_are_taken_off() {
        assert_eq!(strip_verbatim(r"\\?\UNC\server\x"), r"\\server\x");
        assert_eq!(strip_verbatim(r"\\?\C:\x"), r"C:\x");
        assert_eq!(strip_verbatim(r"C:\x"), r"C:\x");
        assert_eq!(strip_verbatim(r"\\server\x"), r"\\server\x");
        assert_eq!(strip_verbatim("/home/x"), "/home/x");
        assert_eq!(strip_verbatim(r"\\?\"), "");
    }

    #[cfg(unix)]
    mod on_unix {
        use std::io::Read;
        use std::os::unix::fs::symlink;
        use std::path::PathBuf;
        use std::sync::{Arc, Mutex};
        use std::time::{Duration, SystemTime, UNIX_EPOCH};

        use closta_core::ports::SavedSessions;

        use super::super::*;
        use crate::claude::history::{ProjectTranscripts, name_of};

        const SESSION: &str = "336ed47b-2675-4317-b3f5-a3b48abb03a2";

        /// A folder of its own under the temp directory, removed when the test ends.
        struct Scratch(PathBuf);

        impl Scratch {
            fn new(name: &str) -> Scratch {
                let dir = std::env::temp_dir()
                    .join(format!("closta-std-fs-{}-{name}", std::process::id()));
                if dir.exists() {
                    std::fs::remove_dir_all(&dir).unwrap();
                }
                std::fs::create_dir_all(&dir).unwrap();
                Scratch(dir)
            }

            fn path(&self, relative: &str) -> PathBuf {
                self.0.join(relative)
            }

            fn file(&self, relative: &str, bytes: &[u8]) -> PathBuf {
                let path = self.path(relative);
                std::fs::create_dir_all(path.parent().unwrap()).unwrap();
                std::fs::write(&path, bytes).unwrap();
                path
            }
        }

        impl Drop for Scratch {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }

        fn sorted(mut entries: Vec<RecordEntry>) -> Vec<RecordEntry> {
            entries.sort_by(|a, b| a.name.cmp(&b.name));
            entries
        }

        fn user_line() -> String {
            format!(
                r#"{{"type":"user","uuid":"u-1","sessionId":"{SESSION}","timestamp":"2026-10-17T05:40:20.077Z","isSidechain":false,"message":{{"role":"user","content":"hello"}}}}"#
            )
        }

        #[test]
        fn a_link_is_not_opened_wherever_it_points() {
            let scratch = Scratch::new("link");
            let outside = scratch.file("outside/secret.jsonl", b"not a record\n");
            std::fs::create_dir_all(scratch.path("place")).unwrap();
            let link = scratch.path("place/a.jsonl");
            symlink(&outside, &link).unwrap();

            let entries = StdRecordFs.entries(&scratch.path("place")).unwrap();

            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].name, "a.jsonl");
            assert_eq!(entries[0].kind, EntryKind::Other);
            let error = StdRecordFs.open(&link).err().unwrap();
            assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        }

        #[test]
        fn a_regular_file_is_listed_with_its_time_and_size() {
            let scratch = Scratch::new("regular");
            let path = scratch.file("place/a.jsonl", b"12345");
            let at = UNIX_EPOCH + Duration::from_millis(1_700_000_000_123);
            File::options()
                .write(true)
                .open(&path)
                .unwrap()
                .set_modified(at)
                .unwrap();
            std::fs::create_dir_all(scratch.path("place/folder")).unwrap();

            let entries = sorted(StdRecordFs.entries(&scratch.path("place")).unwrap());

            assert_eq!(entries.len(), 2);
            assert_eq!(entries[0].name, "a.jsonl");
            assert_eq!(
                entries[0].kind,
                EntryKind::File {
                    modified_ms: 1_700_000_000_123,
                    bytes: 5
                }
            );
            assert_eq!(entries[1].name, "folder");
            assert_eq!(entries[1].kind, EntryKind::Other);
            let mut file = StdRecordFs.open(&path).unwrap();
            assert_eq!(file.len().unwrap(), 5);
            let mut text = String::new();
            file.read_to_string(&mut text).unwrap();
            assert_eq!(text, "12345");
        }

        #[test]
        fn a_file_changed_before_1970_has_time_zero() {
            let scratch = Scratch::new("old");
            let path = scratch.file("place/a.jsonl", b"x");
            File::options()
                .write(true)
                .open(&path)
                .unwrap()
                .set_modified(UNIX_EPOCH - Duration::from_secs(60))
                .unwrap();

            let entries = StdRecordFs.entries(&scratch.path("place")).unwrap();

            assert_eq!(
                entries[0].kind,
                EntryKind::File {
                    modified_ms: 0,
                    bytes: 1
                }
            );
        }

        #[test]
        fn the_real_path_resolves_a_link() {
            let scratch = Scratch::new("real");
            std::fs::create_dir_all(scratch.path("real/dir")).unwrap();
            symlink(scratch.path("real/dir"), scratch.path("link")).unwrap();
            let link = scratch.path("link");

            let real = StdRecordFs.real_path(link.to_str().unwrap()).unwrap();

            assert_eq!(
                PathBuf::from(real),
                std::fs::canonicalize(scratch.path("real/dir")).unwrap()
            );
            assert_eq!(
                StdRecordFs.real_path(scratch.path("missing").to_str().unwrap()),
                None
            );
        }

        #[test]
        fn a_link_to_the_place_is_followed() {
            let scratch = Scratch::new("place-link");
            scratch.file("elsewhere/a.jsonl", b"12");
            symlink(scratch.path("elsewhere"), scratch.path("place")).unwrap();

            assert!(StdRecordFs.is_dir(&scratch.path("place")));
            let entries = StdRecordFs.entries(&scratch.path("place")).unwrap();
            assert_eq!(entries.len(), 1);
            assert!(matches!(entries[0].kind, EntryKind::File { bytes: 2, .. }));
            assert!(StdRecordFs.open(&scratch.path("place/a.jsonl")).is_ok());
            assert!(!StdRecordFs.is_dir(&scratch.path("elsewhere/a.jsonl")));
            assert!(!StdRecordFs.is_dir(&scratch.path("missing")));
        }

        #[test]
        fn reading_and_listing_never_write_the_record() {
            let scratch = Scratch::new("read-only");
            let cwd = "/work/the project";
            let place = format!("config/projects/{}", name_of(cwd));
            let bytes = format!("{}\n", user_line());
            let record = scratch.file(&format!("{place}/{SESSION}.jsonl"), bytes.as_bytes());
            let modified = |path: &Path| std::fs::metadata(path).unwrap().modified().unwrap();
            let names = |dir: &Path| {
                let mut names: Vec<String> = std::fs::read_dir(dir)
                    .unwrap()
                    .map(|it| it.unwrap().file_name().to_string_lossy().into_owned())
                    .collect();
                names.sort();
                names
            };
            let before: SystemTime = modified(&record);
            let names_before = names(&scratch.path(&place));
            let logged = Arc::new(Mutex::new(Vec::<String>::new()));
            let sink = Arc::clone(&logged);
            let config = scratch.path("config");
            let sessions = ProjectTranscripts::new(
                Arc::new(StdRecordFs),
                Arc::new(move || Some(config.clone())),
                Some(cwd.to_owned()),
                false,
                Arc::new(move |line: &str| sink.lock().unwrap().push(line.to_owned())),
            );

            let listed = sessions.list(&|| false).unwrap();
            let read = sessions.read(SESSION, &|| false).unwrap();

            assert_eq!(listed.len(), 1);
            assert_eq!(read.events.len(), 1);
            assert_eq!(std::fs::read(&record).unwrap(), bytes.as_bytes());
            assert_eq!(modified(&record), before);
            assert_eq!(names(&scratch.path(&place)), names_before);
        }
    }
}
