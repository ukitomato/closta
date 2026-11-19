//! The app's log: one file a day under the user's local state, and a panic hook that records
//! where a panic was and how big its message was, never the message. A line may hold only what
//! `closta_session::log` allows; the panic line adds the source file's name and line.

use std::any::Any;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use tracing::level_filters::LevelFilter;
use tracing_appender::rolling::{Builder, Rotation};
use tracing_subscriber::Layer;
use tracing_subscriber::filter::Targets;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

/// How many daily files are kept.
const KEPT_FILES: usize = 7;

/// Where the logs go: `<LOCALAPPDATA>\Closta\logs` on Windows, else
/// `<XDG_STATE_HOME>/closta/logs`, else `<HOME>/.local/state/closta/logs`. An empty variable
/// counts as unset. None when none of them gives a place.
pub fn log_dir(
    local_app_data: Option<OsString>,
    xdg_state_home: Option<OsString>,
    home: Option<OsString>,
    windows: bool,
) -> Option<PathBuf> {
    let set = |value: Option<OsString>| value.filter(|value| !value.is_empty());
    if windows {
        return Some(
            PathBuf::from(set(local_app_data)?)
                .join("Closta")
                .join("logs"),
        );
    }
    let state = match set(xdg_state_home) {
        Some(state) => PathBuf::from(state),
        None => PathBuf::from(set(home)?).join(".local").join("state"),
    };
    Some(state.join("closta").join("logs"))
}

/// What is recorded: the app's own crates (`closta…`) from info up, everything else (GPUI and
/// the rest) from warn up.
pub fn filter() -> Targets {
    Targets::new()
        .with_default(LevelFilter::WARN)
        .with_target("closta", LevelFilter::INFO)
}

/// Starts logging to the daily files. False when there is nowhere to write: the app runs on
/// without a log.
pub fn init() -> bool {
    let var = std::env::var_os;
    match log_dir(
        var("LOCALAPPDATA"),
        var("XDG_STATE_HOME"),
        var("HOME"),
        cfg!(windows),
    ) {
        Some(dir) => init_in(&dir),
        None => false,
    }
}

/// [`init`] in `dir`: `closta.<date>.log`, a new file each day, the last [`KEPT_FILES`] kept,
/// no colour codes.
fn init_in(dir: &Path) -> bool {
    let Ok(appender) = Builder::new()
        .rotation(Rotation::DAILY)
        .filename_prefix("closta")
        .filename_suffix("log")
        .max_log_files(KEPT_FILES)
        .build(dir)
    else {
        return false;
    };
    let layer = tracing_subscriber::fmt::layer()
        .with_ansi(false)
        .with_writer(appender)
        .with_filter(filter());
    tracing_subscriber::registry()
        .with(layer)
        .try_init()
        .is_ok()
}

/// The line a panic is recorded as: the last part of the source file's path, the line, and the
/// payload's type and length. `panic at state.rs:12 (&str, 14 bytes)`. The payload's text, and
/// the directories of the path, are left out: they can name the user and what the user typed.
pub fn panic_line(file: Option<&str>, line: Option<u32>, payload: &(dyn Any + Send)) -> String {
    let file = file
        .and_then(|path| path.rsplit(['/', '\\']).next())
        .filter(|name| !name.is_empty())
        .unwrap_or("unknown");
    let line = line.map_or_else(|| "?".to_owned(), |line| line.to_string());
    let payload = if let Some(text) = payload.downcast_ref::<&str>() {
        format!("&str, {} bytes", text.len())
    } else if let Some(text) = payload.downcast_ref::<String>() {
        format!("String, {} bytes", text.len())
    } else {
        "other".to_owned()
    };
    format!("panic at {file}:{line} ({payload})")
}

/// Records every panic with [`panic_line`]. In a debug build the default hook runs first, so a
/// developer still sees the message; in release nothing else is written.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if cfg!(debug_assertions) {
            previous(info);
        }
        let location = info.location();
        tracing::error!(
            "{}",
            panic_line(
                location.map(|location| location.file()),
                location.map(|location| location.line()),
                info.payload(),
            )
        );
    }));
}

#[cfg(test)]
mod tests {
    use tracing::Level;

    use super::*;

    fn os(text: &str) -> Option<OsString> {
        Some(OsString::from(text))
    }

    #[test]
    fn the_log_dir_is_under_local_app_data_on_windows_and_xdg_state_elsewhere() {
        assert_eq!(
            log_dir(os(r"C:\Users\u\AppData\Local"), os("/x"), os("/h"), true),
            Some(
                PathBuf::from(r"C:\Users\u\AppData\Local")
                    .join("Closta")
                    .join("logs")
            )
        );
        assert_eq!(log_dir(None, os("/x"), os("/h"), true), None);
        assert_eq!(
            log_dir(os("ignored"), os("/state"), os("/h"), false),
            Some(PathBuf::from("/state").join("closta").join("logs"))
        );
        assert_eq!(
            log_dir(None, None, os("/h"), false),
            Some(
                PathBuf::from("/h")
                    .join(".local")
                    .join("state")
                    .join("closta")
                    .join("logs")
            )
        );
        assert_eq!(
            log_dir(None, os(""), os("/h"), false),
            log_dir(None, None, os("/h"), false)
        );
        assert_eq!(log_dir(None, None, None, false), None);
    }

    #[test]
    fn closta_crates_log_info_and_the_rest_warn() {
        let filter = filter();
        assert!(filter.would_enable("closta_session::log", &Level::INFO));
        assert!(filter.would_enable("closta", &Level::INFO));
        assert!(!filter.would_enable("closta_session::log", &Level::DEBUG));
        assert!(!filter.would_enable("gpui", &Level::INFO));
        assert!(filter.would_enable("gpui", &Level::WARN));
    }

    #[test]
    fn a_panic_line_names_the_file_line_and_payload_size_only() {
        let file = "/home/someone/.cargo/registry/src/x/state.rs";
        let line = panic_line(Some(file), Some(12), &"secret /home/someone");
        assert_eq!(line, "panic at state.rs:12 (&str, 20 bytes)");
        let line = panic_line(
            Some(r"C:\Users\someone\src\state.rs"),
            Some(12),
            &String::from("secret /home/someone"),
        );
        assert_eq!(line, "panic at state.rs:12 (String, 20 bytes)");
        let line = panic_line(Some(file), Some(12), &42_i32);
        assert_eq!(line, "panic at state.rs:12 (other)");
        for line in [
            line,
            panic_line(Some(file), Some(12), &"secret /home/someone"),
        ] {
            assert!(!line.contains("someone") && !line.contains("secret"));
        }
        assert_eq!(panic_line(None, None, &1_u8), "panic at unknown:? (other)");
    }

    #[test]
    fn an_unwritable_log_dir_does_not_stop_the_app() {
        let file = std::env::temp_dir().join(format!("closta-log-test-{}", std::process::id()));
        std::fs::write(&file, b"a file, not a folder").expect("the test file is written");
        assert!(!init_in(&file));
        std::fs::remove_file(&file).expect("the test file is removed");
    }
}
