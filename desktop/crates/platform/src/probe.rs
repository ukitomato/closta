//! A check's run (`Probe`): the ready file that says how every slot settled and when the close
//! began and ended, and the close that follows by itself. The file is written whole to a file
//! beside it and renamed over it, so a reader never sees half of it.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// A check's run: what is written where, and when the window closes by itself.
pub struct Probe {
    /// Where the slots' states and the close's times are written.
    pub ready_file: Option<PathBuf>,
    /// How long after every slot first settled the window is closed, as by a confirmed close.
    pub close_after: Option<Duration>,
}

/// What a check's run has written and whether its timed close was set going.
pub(crate) struct Probing {
    probe: Probe,
    /// The slots' lines last written.
    settled: Option<Vec<String>>,
    /// When the close began: its line, and the moment it is timed from.
    closing: Option<(String, Instant)>,
    closed: Option<String>,
    close_set: bool,
}

impl Probing {
    pub(crate) fn new(probe: Probe) -> Probing {
        Probing {
            probe,
            settled: None,
            closing: None,
            closed: None,
            close_set: false,
        }
    }

    /// Takes the shell's ready lines after a refresh: a new set is written; `None` (a slot has
    /// not settled, or no longer is) leaves the file as it is. Returns the wait before the timed
    /// close the first time every slot settled.
    pub(crate) fn settled(&mut self, lines: Option<Vec<String>>) -> Option<Duration> {
        let lines = lines?;
        if self.closing.is_some() {
            return None;
        }
        if self.settled.as_ref() != Some(&lines) {
            self.settled = Some(lines);
            self.write();
        }
        if self.close_set {
            return None;
        }
        self.close_set = true;
        self.probe.close_after
    }

    /// The close began: `closing <unix ms>` is added.
    pub(crate) fn closing(&mut self) {
        if self.closing.is_some() {
            return;
        }
        let unix_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        self.closing = Some((format!("closing {unix_ms}"), Instant::now()));
        self.write();
    }

    /// The close ended: `closed <ms>`, from when it began, is added.
    pub(crate) fn closed(&mut self) {
        let Some((_, began)) = &self.closing else {
            return;
        };
        self.closed = Some(format!("closed {}", began.elapsed().as_millis()));
        self.write();
    }

    /// What the ready file holds now.
    pub(crate) fn lines(&self) -> Vec<String> {
        let mut lines = self.settled.clone().unwrap_or_default();
        lines.extend(self.closing.iter().map(|(line, _)| line.clone()));
        lines.extend(self.closed.clone());
        lines
    }

    fn write(&self) {
        if let Some(path) = &self.probe.ready_file {
            // A check that cannot write its file sees no file and fails by itself.
            _ = write_whole(path, &self.lines());
        }
    }
}

/// Writes `lines` to a file beside `path` and renames it over `path`.
fn write_whole(path: &Path, lines: &[String]) -> std::io::Result<()> {
    let mut text = lines.join("\n");
    text.push('\n');
    let mut name = path.file_name().unwrap_or_default().to_owned();
    name.push(".tmp");
    let temporary = path.with_file_name(name);
    std::fs::write(&temporary, text)?;
    std::fs::rename(&temporary, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(text: &[&str]) -> Option<Vec<String>> {
        Some(text.iter().map(|it| (*it).to_owned()).collect())
    }

    #[test]
    fn the_ready_file_follows_the_settled_slots_and_the_close() {
        let dir = std::env::temp_dir().join(format!("closta-probe-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("ready");
        let read = || std::fs::read_to_string(&path).unwrap();
        let mut probing = Probing::new(Probe {
            ready_file: Some(path.clone()),
            close_after: Some(Duration::from_millis(3000)),
        });

        assert_eq!(probing.settled(None), None);
        assert!(!path.exists());
        assert_eq!(
            probing.settled(lines(&["Running 2.1.282"])),
            Some(Duration::from_millis(3000))
        );
        assert_eq!(read(), "Running 2.1.282\n");
        // The close is set going once; a slot that is no longer settled leaves the file.
        assert_eq!(
            probing.settled(lines(&["Running 2.1.282", "Failed CommandNotFound"])),
            None
        );
        assert_eq!(probing.settled(None), None);
        assert_eq!(read(), "Running 2.1.282\nFailed CommandNotFound\n");

        probing.closing();
        probing.closing();
        let text = read();
        let closing: Vec<&str> = text.lines().collect();
        assert_eq!(closing.len(), 3, "{text}");
        let unix_ms: u128 = closing[2]
            .strip_prefix("closing ")
            .unwrap()
            .parse()
            .unwrap();
        assert!(unix_ms > 1_700_000_000_000, "{unix_ms}");
        // What settles after the close began does not overwrite its line.
        assert_eq!(probing.settled(lines(&["Failed CommandNotFound"])), None);
        assert_eq!(read(), text);

        probing.closed();
        let text = read();
        let last = text.lines().last().unwrap();
        let _ms: u128 = last.strip_prefix("closed ").unwrap().parse().unwrap();
        assert_eq!(text.lines().count(), 4, "{text}");
        assert!(!dir.join("ready.tmp").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn without_a_ready_file_nothing_is_written_and_the_close_still_comes() {
        let mut probing = Probing::new(Probe {
            ready_file: None,
            close_after: Some(Duration::from_millis(10)),
        });
        assert_eq!(
            probing.settled(lines(&["Failed CommandNotFound"])),
            Some(Duration::from_millis(10))
        );
        probing.closing();
        probing.closed();
        assert_eq!(probing.lines().len(), 3);
    }
}
