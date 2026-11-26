//! The settings file: its shape, how it is read, and which value is written next. Nothing here
//! touches the disk.

use std::collections::HashSet;
use std::fmt;
use std::io;
use std::sync::Arc;

use futures_lite::future;
use serde_json::{Value, json};

use crate::projects::{Project, project_key};

pub const SETTINGS_VERSION: u32 = 1;

/// What the settings file holds.
#[derive(Clone, PartialEq, Eq, Default)]
pub struct Settings {
    pub version: u32,
    pub projects: Vec<SavedProject>,
}

/// A project as the file keeps it.
#[derive(Clone, PartialEq, Eq)]
pub struct SavedProject {
    pub folder: String,
    pub collapsed: bool,
}

// Written by hand: the folders are the user's.
impl fmt::Debug for Settings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Settings")
            .field("version", &self.version)
            .field("projects", &self.projects.len())
            .finish()
    }
}

// Written by hand: the folder is the user's.
impl fmt::Debug for SavedProject {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SavedProject")
            .field("collapsed", &self.collapsed)
            .finish()
    }
}

impl Settings {
    /// The settings that keep `projects`, in their order and with their open or closed state.
    pub fn of(projects: &[Project]) -> Settings {
        Settings {
            version: SETTINGS_VERSION,
            projects: projects
                .iter()
                .map(|project| SavedProject {
                    folder: project.folder.clone(),
                    collapsed: project.collapsed,
                })
                .collect(),
        }
    }
}

/// How the text of the file reads.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SettingsRead {
    /// There is no file. `read_settings` never returns this; the app picks it when it finds no
    /// file to read.
    Missing,
    Read(Settings),
    Broken,
}

/// Reads the text of the settings file.
pub fn read_settings(text: &str) -> SettingsRead {
    let Ok(Value::Object(root)) = serde_json::from_str::<Value>(text) else {
        return SettingsRead::Broken;
    };
    let version = match root.get("version").and_then(Value::as_u64) {
        Some(version) if version >= 1 => u32::try_from(version).unwrap_or(u32::MAX),
        _ => return SettingsRead::Broken,
    };
    let Some(Value::Array(entries)) = root.get("projects") else {
        return SettingsRead::Broken;
    };
    let mut seen = HashSet::new();
    let mut projects = Vec::new();
    for entry in entries {
        let Some(folder) = entry.get("folder").and_then(Value::as_str) else {
            continue;
        };
        let Some(key) = project_key(folder) else {
            continue;
        };
        if !seen.insert(key) {
            continue;
        }
        projects.push(SavedProject {
            folder: folder.trim().to_owned(),
            collapsed: entry
                .get("collapsed")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        });
    }
    SettingsRead::Read(Settings { version, projects })
}

/// The text of the settings file: pretty JSON with no trailing newline.
pub fn settings_text(settings: &Settings) -> String {
    let projects: Vec<Value> = settings
        .projects
        .iter()
        .map(|project| json!({ "folder": project.folder, "collapsed": project.collapsed }))
        .collect();
    let root = json!({ "version": settings.version, "projects": projects });
    // A `Value` always serializes; the fallback only satisfies the signature.
    serde_json::to_string_pretty(&root).unwrap_or_default()
}

/// Where the list of projects is kept.
pub trait SettingsSink: Send + Sync {
    /// Keeps `settings`. The caller does not wait.
    fn save(&self, settings: Settings);

    /// Resolves once what was saved has been written.
    fn flushed(&self) -> future::Boxed<()> {
        Box::pin(async {})
    }
}

/// Keeps nothing.
pub struct MemorySettings;

impl SettingsSink for MemorySettings {
    fn save(&self, _settings: Settings) {}
}

/// Hands out the latest value to write: while one is being written, newer ones replace each other
/// and only the last waits.
#[derive(Default)]
pub struct LatestOnly {
    writing: bool,
    waiting: Option<Settings>,
}

impl LatestOnly {
    /// `Some` when nothing is being written: the caller starts writing it.
    pub fn offer(&mut self, settings: Settings) -> Option<Settings> {
        if self.writing {
            self.waiting = Some(settings);
            None
        } else {
            self.writing = true;
            Some(settings)
        }
    }

    /// Called when a write ended: the value to write next, or `None` and the writer is free.
    pub fn written(&mut self) -> Option<Settings> {
        let next = self.waiting.take();
        self.writing = next.is_some();
        next
    }

    pub fn idle(&self) -> bool {
        !self.writing && self.waiting.is_none()
    }
}

/// What the app starts with after reading the file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SettingsStart {
    Empty,
    Read(Settings),
    SetAside,
    Unreadable(io::ErrorKind),
}

/// Decides how to start from what reading the file gave. A leading byte order mark is ignored.
/// A file that is not UTF-8 or not settings is to be set aside; one that cannot be read is left
/// alone.
pub fn settings_start(read: Result<Vec<u8>, io::ErrorKind>) -> SettingsStart {
    let bytes = match read {
        Ok(bytes) => bytes,
        Err(io::ErrorKind::NotFound) => return SettingsStart::Empty,
        Err(kind) => return SettingsStart::Unreadable(kind),
    };
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes);
    let Ok(text) = std::str::from_utf8(bytes) else {
        return SettingsStart::SetAside;
    };
    match read_settings(text) {
        SettingsRead::Read(settings) => SettingsStart::Read(settings),
        SettingsRead::Missing => SettingsStart::Empty,
        SettingsRead::Broken => SettingsStart::SetAside,
    }
}

/// The writer a run uses: the file's when the run keeps settings, otherwise one that keeps
/// nothing (and `file` is not called).
pub fn sink_for_run(
    keeps: bool,
    file: impl FnOnce() -> Arc<dyn SettingsSink>,
) -> Arc<dyn SettingsSink> {
    if keeps {
        file()
    } else {
        Arc::new(MemorySettings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DESIGN: &str = r#"{
  "version": 1,
  "projects": [
    { "folder": "\\\\wsl.localhost\\Ubuntu-26.04\\home\\me\\closta", "collapsed": false },
    { "folder": "C:\\dev\\tools\\closta", "collapsed": true }
  ]
}"#;

    fn saved(folder: &str, collapsed: bool) -> SavedProject {
        SavedProject {
            folder: folder.to_owned(),
            collapsed,
        }
    }

    fn design() -> Settings {
        Settings {
            version: 1,
            projects: vec![
                saved(r"\\wsl.localhost\Ubuntu-26.04\home\me\closta", false),
                saved(r"C:\dev\tools\closta", true),
            ],
        }
    }

    fn read(text: &str) -> SettingsRead {
        read_settings(text)
    }

    #[test]
    fn the_file_of_the_design_reads_back() {
        assert_eq!(read(DESIGN), SettingsRead::Read(design()));
    }

    #[test]
    fn settings_text_is_pretty_json_without_a_trailing_newline() {
        let expected = concat!(
            "{\n",
            "  \"version\": 1,\n",
            "  \"projects\": [\n",
            "    {\n",
            "      \"folder\": \"\\\\\\\\wsl.localhost\\\\Ubuntu-26.04\\\\home\\\\me\\\\closta\",\n",
            "      \"collapsed\": false\n",
            "    },\n",
            "    {\n",
            "      \"folder\": \"C:\\\\dev\\\\tools\\\\closta\",\n",
            "      \"collapsed\": true\n",
            "    }\n",
            "  ]\n",
            "}"
        );
        let text = settings_text(&design());
        assert_eq!(text, expected);
        assert!(text.ends_with('}'));
        assert_eq!(read(&text), SettingsRead::Read(design()));
    }

    #[test]
    fn unknown_fields_are_skipped() {
        let text = r#"{"theme": 1, "version": 1, "projects": [
            {"folder": "C:\\a", "collapsed": true, "theme": 1}]}"#;
        assert_eq!(
            read(text),
            SettingsRead::Read(Settings {
                version: 1,
                projects: vec![saved(r"C:\a", true)],
            })
        );
    }

    #[test]
    fn a_bad_entry_is_dropped_and_the_rest_read() {
        let text = r#"{"version": 1, "projects": [
            {"folder": "C:\\a", "collapsed": "yes"},
            1,
            {},
            {"folder": 3},
            {"folder": "  "},
            {"folder": "C:\\Work", "collapsed": true},
            {"folder": "c:/work/", "collapsed": false},
            {"folder": "C:\\z"}
        ]}"#;
        assert_eq!(
            read(text),
            SettingsRead::Read(Settings {
                version: 1,
                projects: vec![
                    saved(r"C:\a", false),
                    saved(r"C:\Work", true),
                    saved(r"C:\z", false),
                ],
            })
        );
    }

    #[test]
    fn a_file_that_is_not_settings_is_broken() {
        for text in [
            "{",
            "[]",
            r#"{"version":1,"projects":{}}"#,
            r#"{"projects":[]}"#,
            r#"{"version":0,"projects":[]}"#,
            r#"{"version":"1","projects":[]}"#,
        ] {
            assert_eq!(read(text), SettingsRead::Broken, "{text}");
        }
    }

    #[test]
    fn a_later_version_is_still_read() {
        assert_eq!(
            read(r#"{"version": 2, "projects": []}"#),
            SettingsRead::Read(Settings {
                version: 2,
                projects: vec![],
            })
        );
    }

    #[test]
    fn the_start_follows_what_was_read() {
        use io::ErrorKind;
        assert_eq!(
            settings_start(Err(ErrorKind::NotFound)),
            SettingsStart::Empty
        );
        assert_eq!(
            settings_start(Err(ErrorKind::PermissionDenied)),
            SettingsStart::Unreadable(ErrorKind::PermissionDenied)
        );
        let mut bom = vec![0xef, 0xbb, 0xbf];
        bom.extend_from_slice(DESIGN.as_bytes());
        assert_eq!(settings_start(Ok(bom)), SettingsStart::Read(design()));
        assert_eq!(
            settings_start(Ok(vec![0xff, 0xfe])),
            SettingsStart::SetAside
        );
        assert_eq!(settings_start(Ok(b"{".to_vec())), SettingsStart::SetAside);
    }

    #[test]
    fn only_the_latest_value_waits_while_one_is_written() {
        let value = |n: usize| Settings {
            version: 1,
            projects: vec![saved(&format!("C:\\p{n}"), false)],
        };
        let mut gate = LatestOnly::default();
        assert!(gate.idle());
        assert_eq!(gate.offer(value(1)), Some(value(1)));
        assert!(!gate.idle());
        assert_eq!(gate.offer(value(2)), None);
        assert_eq!(gate.offer(value(3)), None);
        assert_eq!(gate.written(), Some(value(3)));
        assert!(!gate.idle());
        assert_eq!(gate.written(), None);
        assert!(gate.idle());
    }

    #[test]
    fn debug_shows_counts_only() {
        let settings = design();
        let shown = format!("{settings:?}");
        assert_eq!(shown, "Settings { version: 1, projects: 2 }");
        assert!(!shown.contains("closta"));
        let shown = format!("{:?}", saved(r"C:\secret\folder", true));
        assert_eq!(shown, "SavedProject { collapsed: true }");
        assert!(!shown.contains("secret"));
    }
}
