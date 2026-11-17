//! Starting `claude` directly on the host: the native spawner and how `claude.exe` is found on
//! Windows. Mirrors NativeProcessSpawner and FilteringProcessSpawner in ProcessSpawner.kt.

use std::collections::BTreeSet;
use std::ffi::OsString;
use std::fmt;
use std::path::{Path, PathBuf};

use super::env::child_environment;
use super::{Launch, LaunchError};
use crate::claude::process::{AgentProcess, ProcessSpawner, os};

/// What a [`NativeSpawner`] runs: `claude`, or a program by its path (the fake CLI in tests).
#[derive(Clone, PartialEq, Eq)]
pub enum NativeProgram {
    /// `claude` from the `PATH` of the child (Unix) or `claude.exe` from the inherited `PATH`
    /// (Windows, see [`locate_claude_exe`]).
    Claude,
    Path(PathBuf),
}

// Written by hand: a path can name the user.
impl fmt::Debug for NativeProgram {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NativeProgram::Claude => f.write_str("Claude"),
            NativeProgram::Path(_) => f.write_str("Path(..)"),
        }
    }
}

/// Starts the program on this host. The child gets an environment built here, never this
/// process's own as it is: the one inherited without the `dropped` names, with the launch's env
/// laid over it.
pub struct NativeSpawner {
    program: NativeProgram,
    dropped: BTreeSet<String>,
    inherited: Vec<(OsString, OsString)>,
}

impl NativeSpawner {
    /// A spawner that inherits this process's environment as it is now.
    pub fn new(program: NativeProgram, dropped: BTreeSet<String>) -> NativeSpawner {
        NativeSpawner {
            program,
            dropped,
            inherited: std::env::vars_os().collect(),
        }
    }

    /// The same spawner inheriting `inherited` instead. Tests use it: changing this process's own
    /// environment is `unsafe`.
    #[must_use]
    pub fn with_inherited(self, inherited: Vec<(OsString, OsString)>) -> NativeSpawner {
        NativeSpawner { inherited, ..self }
    }

    fn program_path(&self) -> Result<PathBuf, LaunchError> {
        match &self.program {
            NativeProgram::Path(path) => Ok(path.clone()),
            // Looked up on the child's `PATH` by the OS.
            #[cfg(not(windows))]
            NativeProgram::Claude => Ok(PathBuf::from("claude")),
            #[cfg(windows)]
            NativeProgram::Claude => {
                let path_var = self
                    .inherited
                    .iter()
                    .find(|(name, _)| name.to_string_lossy().eq_ignore_ascii_case("PATH"))
                    .map(|(_, value)| value.to_string_lossy().into_owned())
                    .unwrap_or_default();
                locate_claude_exe(&path_var, &|candidate| Path::new(candidate).is_file())
                    .map(PathBuf::from)
            }
        }
    }
}

impl ProcessSpawner for NativeSpawner {
    fn spawn(&self, launch: &Launch) -> Result<Box<dyn AgentProcess>, LaunchError> {
        let is_dir = |path: &str| Path::new(path).is_dir();
        let program = self
            .program_path()
            .map_err(|failure| folder_first(failure, launch.cwd.as_deref(), &is_dir))?;
        let mut command = std::process::Command::new(program);
        command
            .args(&launch.args)
            .env_clear()
            .envs(child_environment(
                &self.inherited,
                &self.dropped,
                &launch.env,
            ));
        if let Some(cwd) = &launch.cwd {
            command.current_dir(cwd);
        }
        os::start(command).map_err(|failure| folder_first(failure, launch.cwd.as_deref(), &is_dir))
    }
}

/// `failure` as the user should see it first: a launch that could not find or start its program
/// ([`LaunchError::Spawn`], [`LaunchError::CommandNotFound`], [`LaunchError::ScriptOnly`]) with a
/// `cwd` that `is_dir` says is not a folder is [`LaunchError::WorkingDirectoryMissing`], since the
/// folder is what to fix first. Anything else, and any failure in a present folder, is kept.
///
/// Kotlin's `startIn` applied the rule to a failed start only; here it covers the search for
/// `claude.exe` too, so a missing worktree is named before a missing `claude`.
pub fn folder_first(
    failure: LaunchError,
    cwd: Option<&str>,
    is_dir: &dyn Fn(&str) -> bool,
) -> LaunchError {
    match (&failure, cwd) {
        (
            LaunchError::Spawn(_) | LaunchError::CommandNotFound | LaunchError::ScriptOnly,
            Some(cwd),
        ) if !is_dir(cwd) => LaunchError::WorkingDirectoryMissing {
            path: cwd.to_owned(),
        },
        _ => failure,
    }
}

/// The `claude.exe` on `path_var` (a Windows `PATH`, `;`-separated, entries maybe quoted), the
/// first in order. A script (`claude.cmd`, `.bat`, `.ps1`) is never run: it goes through
/// `cmd.exe`, whose quoting breaks the arguments. When only a script is found the failure is
/// [`LaunchError::ScriptOnly`]; when nothing is, [`LaunchError::CommandNotFound`].
pub fn locate_claude_exe(
    path_var: &str,
    is_file: &dyn Fn(&str) -> bool,
) -> Result<String, LaunchError> {
    let dirs = path_var
        .split(';')
        .map(|entry| entry.trim_matches('"').trim_end_matches('\\'))
        .filter(|dir| !dir.is_empty());
    let mut script_found = false;
    for dir in dirs {
        let exe = format!(r"{dir}\claude.exe");
        if is_file(&exe) {
            return Ok(exe);
        }
        script_found = script_found
            || ["claude.cmd", "claude.bat", "claude.ps1"]
                .iter()
                .any(|script| is_file(&format!(r"{dir}\{script}")));
    }
    Err(if script_found {
        LaunchError::ScriptOnly
    } else {
        LaunchError::CommandNotFound
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn present(files: &[&str]) -> impl Fn(&str) -> bool {
        let files: Vec<String> = files.iter().map(|f| (*f).to_owned()).collect();
        move |path| files.iter().any(|f| f == path)
    }

    const PATH: &str = "C:\\a;;\"C:\\b\\\"";

    #[test]
    fn a_missing_folder_wins_over_a_missing_claude() {
        let no_folder = |_: &str| false;
        let a_folder = |_: &str| true;
        let missing = || LaunchError::WorkingDirectoryMissing {
            path: "/gone".to_owned(),
        };
        for failure in [
            LaunchError::CommandNotFound,
            LaunchError::ScriptOnly,
            LaunchError::Spawn(std::io::ErrorKind::NotFound),
        ] {
            assert_eq!(
                folder_first(failure.clone(), Some("/gone"), &no_folder),
                missing(),
                "{failure:?} in a missing folder"
            );
            assert_eq!(
                folder_first(failure.clone(), Some("/here"), &a_folder),
                failure,
                "{failure:?} in a present folder"
            );
            assert_eq!(
                folder_first(failure.clone(), None, &no_folder),
                failure,
                "{failure:?} with no folder"
            );
        }
        assert_eq!(
            folder_first(LaunchError::TooManyProcesses, Some("/gone"), &no_folder),
            LaunchError::TooManyProcesses
        );
    }

    #[test]
    fn the_native_spawner_is_not_wsl() {
        let spawner = NativeSpawner::new(NativeProgram::Claude, BTreeSet::new());
        assert_eq!(spawner.wsl_distro(), None);
    }

    #[test]
    fn claude_exe_wins_and_scripts_alone_are_refused() {
        assert_eq!(
            locate_claude_exe(PATH, &present(&[r"C:\a\claude.cmd", r"C:\b\claude.exe"])),
            Ok(r"C:\b\claude.exe".to_owned())
        );
        assert_eq!(
            locate_claude_exe(PATH, &present(&[r"C:\a\claude.cmd"])),
            Err(LaunchError::ScriptOnly)
        );
        assert_eq!(
            locate_claude_exe(PATH, &present(&[])),
            Err(LaunchError::CommandNotFound)
        );
    }

    #[test]
    fn every_script_kind_is_refused_and_the_first_exe_is_taken() {
        for script in ["claude.bat", "claude.ps1"] {
            assert_eq!(
                locate_claude_exe(PATH, &present(&[&format!(r"C:\b\{script}")])),
                Err(LaunchError::ScriptOnly),
                "{script}"
            );
        }
        assert_eq!(
            locate_claude_exe(
                r"C:\a\\;C:\b",
                &present(&[r"C:\a\claude.exe", r"C:\b\claude.exe"])
            ),
            Ok(r"C:\a\claude.exe".to_owned())
        );
        assert_eq!(
            locate_claude_exe("", &present(&[r"\claude.exe"])),
            Err(LaunchError::CommandNotFound)
        );
    }
}
