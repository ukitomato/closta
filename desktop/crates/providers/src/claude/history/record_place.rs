//! Where the CLI keeps the records of one project: `<config>/projects/<name>/`, with `<name>` made from the
//! real path of the working folder. A place that cannot be found is not made up, and the reason is logged
//! in the words of what was being done. No path is ever logged.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};

use super::record_files::RecordFs;

/// The longest folder name the CLI makes, in UTF-16 units.
pub(crate) const MAX_NAME_LENGTH: usize = 200;

/// The CLI's folder name for a working folder: every UTF-16 unit that is not an ASCII letter or digit is `-`.
pub fn name_of(directory: &str) -> String {
    directory
        .encode_utf16()
        .map(|unit| match u8::try_from(unit) {
            Ok(b) if b.is_ascii_alphanumeric() => char::from(b),
            _ => '-',
        })
        .collect()
}

/// What a place that is not there leaves undone.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RecordPlaceUse {
    List,
    Read,
}

impl RecordPlaceUse {
    pub fn consequence(self) -> &'static str {
        match self {
            Self::List => "none are listed",
            Self::Read => "nothing is restored",
        }
    }
}

type ConfigDir = Arc<dyn Fn() -> Option<PathBuf> + Send + Sync>;

pub(crate) struct RecordPlace {
    config_dir: ConfigDir,
    working_directory: Option<String>,
    resolve_links: bool,
    // Asked under the lock, so calls side by side wait for one question. Only a found folder is kept.
    config: Mutex<Option<PathBuf>>,
}

impl RecordPlace {
    pub(crate) fn new(
        config_dir: ConfigDir,
        working_directory: Option<String>,
        resolve_links: bool,
    ) -> Self {
        Self {
            config_dir,
            working_directory,
            resolve_links,
            config: Mutex::new(None),
        }
    }

    fn config(&self) -> Option<PathBuf> {
        let mut held = self.config.lock().unwrap_or_else(PoisonError::into_inner);
        if held.is_none() {
            *held = (self.config_dir)();
        }
        held.clone()
    }

    /// The place of the project's records, or `None` (and the reason logged) when there is none to read.
    pub(crate) fn find(
        &self,
        fs: &dyn RecordFs,
        use_: RecordPlaceUse,
        log: &dyn Fn(&str),
    ) -> Option<PathBuf> {
        let reason = match self.look(fs, log) {
            Ok(place) => return Some(place),
            Err(reason) => reason,
        };
        log(&format!(
            "saved sessions: {reason}, so {}",
            use_.consequence()
        ));
        None
    }

    fn look(&self, fs: &dyn RecordFs, log: &dyn Fn(&str)) -> Result<PathBuf, &'static str> {
        let directory = self
            .working_directory
            .as_deref()
            .ok_or("the project has no working directory")?;
        let name = if self.resolve_links {
            match fs.real_path(directory) {
                Some(real) => name_of(&real),
                None => {
                    log(
                        "saved sessions: the project's directory has no real path, so its name is used as it is",
                    );
                    name_of(directory)
                }
            }
        } else {
            name_of(directory)
        };
        if name.len() > MAX_NAME_LENGTH {
            return Err("the project's directory name is longer than 200");
        }
        let config = self
            .config()
            .ok_or("the CLI's config directory could not be found")?;
        let place = config.join("projects").join(name);
        if fs.is_dir(&place) {
            Ok(place)
        } else {
            Err("the CLI has no place for this project yet")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::fake::record_fs::MemoryRecordFs;
    use std::path::Path;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    type Log = Arc<Mutex<Vec<String>>>;

    fn logger() -> (Log, impl Fn(&str)) {
        let lines: Log = Arc::default();
        let sink = Arc::clone(&lines);
        (lines, move |s: &str| {
            sink.lock().unwrap().push(s.to_owned())
        })
    }

    fn fixed(config: Option<&str>) -> ConfigDir {
        let config = config.map(PathBuf::from);
        Arc::new(move || config.clone())
    }

    fn counting(answers: Vec<Option<&str>>) -> (Arc<AtomicUsize>, ConfigDir) {
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&calls);
        let answers: Vec<Option<PathBuf>> =
            answers.into_iter().map(|a| a.map(PathBuf::from)).collect();
        (
            calls,
            Arc::new(move || {
                let at = seen.fetch_add(1, Ordering::SeqCst);
                answers[at.min(answers.len() - 1)].clone()
            }),
        )
    }

    #[test]
    fn names_make_every_character_but_a_letter_or_a_digit_a_dash() {
        assert_eq!(
            name_of("/home/me/my.project/_x/1"),
            "-home-me-my-project--x-1"
        );
        assert_eq!(name_of("😀"), "--");
        assert_eq!(name_of("C:\\dev\\é"), "C--dev--");
    }

    #[test]
    fn no_folder_or_a_name_past_200_has_no_place_and_says_why() {
        let fs = MemoryRecordFs::default();
        let (lines, log) = logger();
        let none = RecordPlace::new(fixed(Some("/config")), None, false);
        assert_eq!(none.find(&fs, RecordPlaceUse::List, &log), None);
        let long = RecordPlace::new(fixed(Some("/config")), Some("a".repeat(201)), false);
        assert_eq!(long.find(&fs, RecordPlaceUse::Read, &log), None);
        // exactly 200 goes on to ask the config directory
        let (calls, config) = counting(vec![None]);
        let edge = RecordPlace::new(config, Some("a".repeat(200)), false);
        assert_eq!(edge.find(&fs, RecordPlaceUse::List, &log), None);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        let lines = lines.lock().unwrap();
        assert_eq!(
            lines[0],
            "saved sessions: the project has no working directory, so none are listed"
        );
        assert_eq!(
            lines[1],
            "saved sessions: the project's directory name is longer than 200, so nothing is restored"
        );
        assert_eq!(
            lines[2],
            "saved sessions: the CLI's config directory could not be found, so none are listed"
        );
    }

    #[test]
    fn the_place_is_named_from_the_real_path() {
        let fs = MemoryRecordFs::default();
        fs.set_real_path("/work/link", "/real/dir");
        fs.dir("/config/projects/-real-dir");
        let (lines, log) = logger();
        let place = RecordPlace::new(fixed(Some("/config")), Some("/work/link".into()), true);
        assert_eq!(
            place.find(&fs, RecordPlaceUse::List, &log),
            Some(PathBuf::from("/config/projects/-real-dir"))
        );
        assert!(lines.lock().unwrap().is_empty());

        let fs = MemoryRecordFs::default();
        fs.dir("/config/projects/-work-link");
        let (lines, log) = logger();
        assert_eq!(
            place.find(&fs, RecordPlaceUse::List, &log),
            Some(PathBuf::from("/config/projects/-work-link"))
        );
        assert_eq!(
            *lines.lock().unwrap(),
            vec![
                "saved sessions: the project's directory has no real path, so its name is used as it is"
            ]
        );
    }

    struct NoRealPath(MemoryRecordFs);

    impl RecordFs for NoRealPath {
        fn entries(&self, dir: &Path) -> std::io::Result<Vec<super::super::RecordEntry>> {
            self.0.entries(dir)
        }
        fn is_dir(&self, dir: &Path) -> bool {
            self.0.is_dir(dir)
        }
        fn open(
            &self,
            path: &Path,
        ) -> std::io::Result<Box<dyn super::super::record_files::RecordFile>> {
            self.0.open(path)
        }
        fn real_path(&self, _: &str) -> Option<String> {
            panic!("real_path must not be asked");
        }
    }

    #[test]
    fn a_linux_path_is_named_as_it_is() {
        let fs = NoRealPath(MemoryRecordFs::default());
        fs.0.dir("/config/projects/-home-u-my-proj");
        let (lines, log) = logger();
        let place = RecordPlace::new(
            fixed(Some("/config")),
            Some("/home/u/my_proj".into()),
            false,
        );
        assert_eq!(
            place.find(&fs, RecordPlaceUse::Read, &log),
            Some(PathBuf::from("/config/projects/-home-u-my-proj"))
        );
        assert!(lines.lock().unwrap().is_empty());
    }

    #[test]
    fn a_place_that_is_not_there_says_why_in_the_words_of_what_was_asked() {
        let fs = MemoryRecordFs::default();
        fs.dir("/config/projects");
        let (lines, log) = logger();
        let place = RecordPlace::new(fixed(Some("/config")), Some("/work/x".into()), false);
        assert_eq!(place.find(&fs, RecordPlaceUse::List, &log), None);
        assert_eq!(place.find(&fs, RecordPlaceUse::Read, &log), None);
        assert_eq!(
            *lines.lock().unwrap(),
            vec![
                "saved sessions: the CLI has no place for this project yet, so none are listed",
                "saved sessions: the CLI has no place for this project yet, so nothing is restored",
            ]
        );
    }

    #[test]
    fn the_config_directory_is_asked_once_when_found() {
        let fs = MemoryRecordFs::default();
        fs.dir("/config/projects/-work-x");
        let (calls, config) = counting(vec![Some("/config")]);
        let place = RecordPlace::new(config, Some("/work/x".into()), false);
        for _ in 0..3 {
            assert!(place.find(&fs, RecordPlaceUse::List, &|_| {}).is_some());
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_config_directory_not_found_is_asked_again() {
        let fs = MemoryRecordFs::default();
        fs.dir("/config/projects/-work-x");
        let (calls, config) = counting(vec![None, Some("/config")]);
        let place = RecordPlace::new(config, Some("/work/x".into()), false);
        assert!(place.find(&fs, RecordPlaceUse::List, &|_| {}).is_none());
        assert!(place.find(&fs, RecordPlaceUse::List, &|_| {}).is_some());
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn two_finds_side_by_side_ask_once() {
        let fs = MemoryRecordFs::default();
        fs.dir("/config/projects/-work-x");
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = Arc::clone(&calls);
        let config: ConfigDir = Arc::new(move || {
            seen.fetch_add(1, Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(20));
            Some(PathBuf::from("/config"))
        });
        let place = RecordPlace::new(config, Some("/work/x".into()), false);
        std::thread::scope(|s| {
            for _ in 0..2 {
                s.spawn(|| assert!(place.find(&fs, RecordPlaceUse::List, &|_| {}).is_some()));
            }
        });
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_place_that_is_a_link_to_a_directory_is_followed() {
        let fs = MemoryRecordFs::default();
        fs.put("/real/a.jsonl", b"{}\n".to_vec(), 5);
        fs.link("/config/projects/-work-x", "/real");
        let place = RecordPlace::new(fixed(Some("/config")), Some("/work/x".into()), false);
        let found = place.find(&fs, RecordPlaceUse::List, &|_| {}).unwrap();
        assert_eq!(found, PathBuf::from("/config/projects/-work-x"));
        assert!(fs.is_dir(&found));
        assert_eq!(fs.entries(&found).unwrap().len(), 1);
        assert!(fs.open(&found.join("a.jsonl")).is_ok());
    }

    #[test]
    fn the_log_holds_no_path() {
        let fs = MemoryRecordFs::default();
        let (lines, log) = logger();
        let cases = [
            RecordPlace::new(fixed(Some("/config")), None, true),
            RecordPlace::new(fixed(Some("/config")), Some("/work".repeat(60)), true),
            RecordPlace::new(fixed(None), Some("/work".into()), true),
            RecordPlace::new(fixed(Some("/config")), Some("/work".into()), true),
        ];
        for place in &cases {
            place.find(&fs, RecordPlaceUse::List, &log);
            place.find(&fs, RecordPlaceUse::Read, &log);
        }
        let lines = lines.lock().unwrap();
        assert!(lines.len() >= 8);
        assert!(
            lines
                .iter()
                .all(|l| !l.contains("/work") && !l.contains("/config"))
        );
    }
}
