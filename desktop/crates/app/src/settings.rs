//! The settings file on this machine: `<LOCALAPPDATA>\Closta\settings.json`, read once at the
//! start and written in the background, the latest value only. A line logged here names only
//! the kind of an error, never a path or what the file holds.

use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use closta_platform::write_whole;
use closta_shell::settings::{
    LatestOnly, MemorySettings, Settings, SettingsSink, SettingsStart, settings_start,
    settings_text,
};
use futures_lite::future;

/// The file's name in its folder.
pub const SETTINGS_FILE: &str = "settings.json";
/// The name a file that could not be read is set aside under.
const SET_ASIDE_FILE: &str = "settings.json.bak";
/// How long closing the window waits for the settings to be written.
const FLUSH_LIMIT: Duration = Duration::from_secs(1);

/// Where the settings are kept: `<LOCALAPPDATA>\Closta`. None when the variable is unset or
/// empty.
pub fn settings_dir(local_app_data: Option<OsString>) -> Option<PathBuf> {
    let local = local_app_data.filter(|value| !value.is_empty())?;
    Some(PathBuf::from(local).join("Closta"))
}

/// Reads the settings in `dir` and gives the writer that keeps them. A file that is not settings
/// is set aside and the projects start empty; a file that cannot be read, or set aside, or that a newer
/// version wrote, is never written over.
pub fn load(dir: &Path) -> (Settings, Arc<dyn SettingsSink>) {
    let path = dir.join(SETTINGS_FILE);
    let file = || -> Arc<dyn SettingsSink> { Arc::new(FileSettings::new(dir.to_path_buf())) };
    let kept_nowhere = || -> Arc<dyn SettingsSink> { Arc::new(MemorySettings) };
    match settings_start(std::fs::read(&path).map_err(|error| error.kind())) {
        SettingsStart::Empty => (Settings::default(), file()),
        SettingsStart::Read(settings) => (settings, file()),
        // Written back it would lose what a newer version added.
        SettingsStart::Newer(settings) => (settings, kept_nowhere()),
        SettingsStart::SetAside => match std::fs::rename(&path, dir.join(SET_ASIDE_FILE)) {
            Ok(()) => {
                tracing::warn!("the settings could not be read and were set aside");
                (Settings::default(), file())
            }
            Err(error) => {
                tracing::warn!("the settings could not be set aside ({:?})", error.kind());
                (Settings::default(), kept_nowhere())
            }
        },
        SettingsStart::Unreadable(kind) => {
            tracing::warn!("the settings could not be read ({kind:?})");
            (Settings::default(), kept_nowhere())
        }
    }
}

/// Writes `settings` as the file in `dir`, making the folder first.
fn write_file(dir: &Path, settings: &Settings) -> io::Result<()> {
    std::fs::create_dir_all(dir)?;
    write_whole(&dir.join(SETTINGS_FILE), &[settings_text(settings)])
}

type WriteFile = Box<dyn Fn(&Path, &Settings) -> io::Result<()> + Send + Sync>;

/// The writer of the settings file: each value is written in the background, and while one is
/// written only the latest of those that came meanwhile waits.
pub struct FileSettings {
    shared: Arc<Shared>,
}

struct Shared {
    dir: PathBuf,
    write: WriteFile,
    latest: Mutex<LatestOnly>,
    /// Told whenever the writer becomes free.
    free: Condvar,
}

impl FileSettings {
    pub fn new(dir: PathBuf) -> FileSettings {
        FileSettings::with_write(dir, Box::new(write_file))
    }

    fn with_write(dir: PathBuf, write: WriteFile) -> FileSettings {
        FileSettings {
            shared: Arc::new(Shared {
                dir,
                write,
                latest: Mutex::new(LatestOnly::default()),
                free: Condvar::new(),
            }),
        }
    }
}

impl Shared {
    fn latest(&self) -> MutexGuard<'_, LatestOnly> {
        self.latest.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Writes `settings`, then whatever came meanwhile, until nothing waits.
    fn write_from(&self, mut settings: Settings) {
        loop {
            if let Err(error) = (self.write)(&self.dir, &settings) {
                tracing::warn!("the settings could not be written ({:?})", error.kind());
            }
            let mut latest = self.latest();
            match latest.written() {
                Some(next) => settings = next,
                None => {
                    drop(latest);
                    self.free.notify_all();
                    return;
                }
            }
        }
    }
}

impl SettingsSink for FileSettings {
    fn save(&self, settings: Settings) {
        let Some(first) = self.shared.latest().offer(settings) else {
            return;
        };
        let shared = Arc::clone(&self.shared);
        blocking::unblock(move || shared.write_from(first)).detach();
    }

    fn flushed(&self) -> future::Boxed<()> {
        let shared = Arc::clone(&self.shared);
        // Waited for on a blocking thread: neither the window nor an executor stops.
        Box::pin(blocking::unblock(move || {
            let latest = shared.latest();
            let (_latest, waited) = shared
                .free
                .wait_timeout_while(latest, FLUSH_LIMIT, |latest| !latest.idle())
                .unwrap_or_else(PoisonError::into_inner);
            if waited.timed_out() {
                tracing::warn!("the settings were not all written before the window closed");
            }
        }))
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write as _;
    use std::sync::OnceLock;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use closta_shell::settings::SavedProject;

    use super::*;

    /// A folder of its own for each test, made empty.
    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("closta-settings-{name}-{}", std::process::id()));
        _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn value(folders: &[&str]) -> Settings {
        Settings {
            version: 1,
            projects: folders
                .iter()
                .map(|folder| SavedProject {
                    folder: (*folder).to_owned(),
                    collapsed: false,
                })
                .collect(),
        }
    }

    fn flush(sink: &Arc<dyn SettingsSink>) {
        smol::block_on(sink.flushed());
    }

    /// What every thread logged since the first call: the writes are logged from the
    /// background, so a subscriber of the test's thread alone would not see them.
    fn captured() -> Arc<Mutex<Vec<u8>>> {
        static LOG: OnceLock<Arc<Mutex<Vec<u8>>>> = OnceLock::new();
        Arc::clone(LOG.get_or_init(|| {
            let log = Arc::new(Mutex::new(Vec::new()));
            let writer = Arc::clone(&log);
            let subscriber = tracing_subscriber::fmt()
                .with_ansi(false)
                .with_writer(move || Capture(Arc::clone(&writer)))
                .finish();
            tracing::subscriber::set_global_default(subscriber).unwrap();
            log
        }))
    }

    struct Capture(Arc<Mutex<Vec<u8>>>);

    impl io::Write for Capture {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .write(bytes)
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    fn log_text(log: &Arc<Mutex<Vec<u8>>>) -> String {
        String::from_utf8_lossy(&log.lock().unwrap_or_else(PoisonError::into_inner)).into_owned()
    }

    #[test]
    fn the_place_is_closta_under_local_app_data() {
        assert_eq!(
            settings_dir(Some(OsString::from(r"C:\Users\u\AppData\Local"))),
            Some(PathBuf::from(r"C:\Users\u\AppData\Local").join("Closta"))
        );
        assert_eq!(settings_dir(Some(OsString::new())), None);
        assert_eq!(settings_dir(None), None);
    }

    #[test]
    fn a_missing_file_starts_empty_and_writes_nothing_yet() {
        let dir = scratch("missing").join("Closta");
        let (settings, sink) = load(&dir);
        assert!(settings.projects.is_empty());
        assert!(!dir.exists(), "reading made the folder");

        // The writer is the file's: the first save makes the folder and the file.
        sink.save(value(&[r"C:\a"]));
        flush(&sink);
        let text = std::fs::read_to_string(dir.join(SETTINGS_FILE)).unwrap();
        assert_eq!(text, format!("{}\n", settings_text(&value(&[r"C:\a"]))));
        std::fs::remove_dir_all(dir.parent().unwrap()).unwrap();
    }

    #[test]
    fn a_file_reads_back_its_projects() {
        let dir = scratch("read");
        let kept = value(&[r"C:\a", r"\\wsl.localhost\Ubuntu\home\me\b"]);
        std::fs::write(dir.join(SETTINGS_FILE), settings_text(&kept)).unwrap();
        let (settings, _) = load(&dir);
        assert_eq!(settings, kept);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_broken_file_is_set_aside_as_bak() {
        let dir = scratch("broken");
        std::fs::write(dir.join(SETTINGS_FILE), "{").unwrap();
        std::fs::write(dir.join(SET_ASIDE_FILE), "an older one").unwrap();
        let (settings, sink) = load(&dir);
        assert!(settings.projects.is_empty());
        assert!(!dir.join(SETTINGS_FILE).exists());
        assert_eq!(
            std::fs::read_to_string(dir.join(SET_ASIDE_FILE)).unwrap(),
            "{"
        );

        sink.save(value(&[r"C:\a"]));
        flush(&sink);
        assert!(dir.join(SETTINGS_FILE).exists(), "the file is written anew");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_file_that_cannot_be_set_aside_is_never_written() {
        let dir = scratch("stuck");
        std::fs::write(dir.join(SETTINGS_FILE), "{").unwrap();
        // A folder with something in it where the set-aside file would go.
        std::fs::create_dir_all(dir.join(SET_ASIDE_FILE).join("inside")).unwrap();
        let (settings, sink) = load(&dir);
        assert!(settings.projects.is_empty());

        sink.save(value(&[r"C:\a"]));
        flush(&sink);
        assert_eq!(
            std::fs::read_to_string(dir.join(SETTINGS_FILE)).unwrap(),
            "{"
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn saves_coalesce_to_the_last() {
        let dir = scratch("coalesce");
        let writes = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&writes);
        let sink: Arc<dyn SettingsSink> = Arc::new(FileSettings::with_write(
            dir.clone(),
            Box::new(move |dir, settings| {
                counted.fetch_add(1, Ordering::SeqCst);
                std::thread::sleep(Duration::from_millis(100));
                write_file(dir, settings)
            }),
        ));
        for folders in [[r"C:\a"], [r"C:\b"], [r"C:\c"]] {
            sink.save(value(&folders));
        }
        flush(&sink);
        assert!(
            writes.load(Ordering::SeqCst) <= 2,
            "every value was written"
        );
        assert_eq!(
            std::fs::read_to_string(dir.join(SETTINGS_FILE)).unwrap(),
            format!("{}\n", settings_text(&value(&[r"C:\c"])))
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_write_that_fails_names_only_the_kind() {
        let log = captured();
        let parent = scratch("unwritable");
        // The place of the file is a file.
        let dir = parent.join("Closta");
        std::fs::File::create(&dir)
            .unwrap()
            .write_all(b"a file, not a folder")
            .unwrap();
        let sink: Arc<dyn SettingsSink> = Arc::new(FileSettings::new(dir.clone()));
        sink.save(value(&[r"C:\secret\folder"]));
        flush(&sink);

        let text = log_text(&log);
        assert!(
            text.contains("the settings could not be written ("),
            "{text}"
        );
        for leak in [
            "Closta".to_owned(),
            parent.to_string_lossy().into_owned(),
            "secret".to_owned(),
        ] {
            assert!(!text.contains(&leak), "the log names {leak}");
        }
        let names: Vec<OsString> = std::fs::read_dir(&parent)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(names, vec![OsString::from("Closta")], "{names:?}");
        std::fs::remove_dir_all(&parent).unwrap();
    }
}
