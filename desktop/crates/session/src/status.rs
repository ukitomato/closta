//! Where a session is in its life, and why it failed. SessionStatus.kt.
//!
//! The words shown to the user are the platform's work: a failure here is only its kind and the
//! values the platform needs to word it.

use std::fmt;
use std::io::ErrorKind;

use closta_providers::claude::launch::LaunchError;
use closta_providers::claude::launch::version::VersionFailure;
use closta_providers::claude::process::ProcessFailure;

/// What a shell reports for a command it could not find.
const COMMAND_NOT_FOUND: i32 = 127;

/// Where one session is in its life. It moves forward: Starting, then Running, then one of the
/// three ends. A restart that turns the sandbox on goes from Running back to Starting once, and
/// then to Running again. The commands of a running session are on the runtime, not here.
#[derive(Clone, PartialEq, Debug)]
pub enum SessionStatus {
    /// Planning the launch, checking `claude --version`, or starting the process.
    Starting,
    /// The process is up.
    Running { version: String },
    /// The process closed its output and exited with 0 on its own.
    Ended,
    /// The session could not start, or its process ended abnormally.
    Failed(SessionFailure),
    /// The host closed the session.
    Closed,
}

impl SessionStatus {
    /// Whether this is one of the three ends.
    pub fn is_end(&self) -> bool {
        matches!(
            self,
            SessionStatus::Ended | SessionStatus::Failed(_) | SessionStatus::Closed
        )
    }
}

/// Why a session failed, sorted by what the user has to do about it.
#[derive(Clone, PartialEq)]
pub enum SessionFailure {
    /// The OS refused to create the process.
    LaunchFailed { kind: ErrorKind },
    /// The process could not be created because the working folder is not there (a worktree
    /// that was removed).
    WorkingDirectoryMissing { path: String },
    /// The WSL distribution was not found or does not hold the folder.
    WslUnavailable { distro: String },
    /// A launch in WSL exited with 127: the distribution's login shell did not find a command.
    WslCommandNotFound { distro: String },
    /// No `claude` was found, or the process exited with 127.
    CommandNotFound,
    /// Only a script of `claude` was found, which is not run.
    ScriptOnly,
    /// Too many children are alive to start another.
    TooManyProcesses,
    /// The process ended with another nonzero code, or its output broke while it ran.
    EndedAbnormally(ProcessFailure),
    /// `claude --version` exited nonzero, printed nothing, did not answer in time, or printed
    /// no version.
    VersionCheckFailed(VersionFailure),
    /// The launch could not be planned.
    PlanFailed,
}

impl SessionFailure {
    /// The variant's name: the only form of a failure that goes to the log.
    pub fn kind(&self) -> &'static str {
        match self {
            SessionFailure::LaunchFailed { .. } => "LaunchFailed",
            SessionFailure::WorkingDirectoryMissing { .. } => "WorkingDirectoryMissing",
            SessionFailure::WslUnavailable { .. } => "WslUnavailable",
            SessionFailure::WslCommandNotFound { .. } => "WslCommandNotFound",
            SessionFailure::CommandNotFound => "CommandNotFound",
            SessionFailure::ScriptOnly => "ScriptOnly",
            SessionFailure::TooManyProcesses => "TooManyProcesses",
            SessionFailure::EndedAbnormally(_) => "EndedAbnormally",
            SessionFailure::VersionCheckFailed(_) => "VersionCheckFailed",
            SessionFailure::PlanFailed => "PlanFailed",
        }
    }

    /// A launch that could not start the process.
    pub fn from_launch(error: &LaunchError) -> SessionFailure {
        match error {
            LaunchError::Spawn(kind) => SessionFailure::LaunchFailed { kind: *kind },
            LaunchError::WorkingDirectoryMissing { path } => {
                SessionFailure::WorkingDirectoryMissing { path: path.clone() }
            }
            LaunchError::WslUnavailable { distro } => SessionFailure::WslUnavailable {
                distro: distro.clone(),
            },
            LaunchError::ScriptOnly => SessionFailure::ScriptOnly,
            LaunchError::CommandNotFound => SessionFailure::CommandNotFound,
            LaunchError::TooManyProcesses => SessionFailure::TooManyProcesses,
        }
    }

    /// How a running session's output ended abnormally.
    pub fn from_exit(failure: ProcessFailure) -> SessionFailure {
        match failure {
            ProcessFailure::Exit(COMMAND_NOT_FOUND) => SessionFailure::CommandNotFound,
            failure => SessionFailure::EndedAbnormally(failure),
        }
    }

    /// How the version check failed: a spawn failure is a launch failure, and 127 means the same
    /// as for the session.
    pub fn from_version(failure: VersionFailure) -> SessionFailure {
        match failure {
            VersionFailure::Spawn(error) => SessionFailure::from_launch(&error),
            VersionFailure::Exit(COMMAND_NOT_FOUND) => SessionFailure::CommandNotFound,
            failure => SessionFailure::VersionCheckFailed(failure),
        }
    }

    /// This failure as it reads for a launch through a spawner in `wsl_distro`: in WSL a 127 is
    /// the distribution's login shell not finding a command, which the host's PATH has nothing
    /// to do with. Anything else stays as it is.
    pub fn for_spawner(self, wsl_distro: Option<&str>) -> SessionFailure {
        match (self, wsl_distro) {
            (SessionFailure::CommandNotFound, Some(distro)) => SessionFailure::WslCommandNotFound {
                distro: distro.to_owned(),
            },
            (failure, _) => failure,
        }
    }
}

// Written by hand so that the missing folder's path is not shown.
impl fmt::Debug for SessionFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SessionFailure::LaunchFailed { kind } => {
                f.debug_struct("LaunchFailed").field("kind", kind).finish()
            }
            SessionFailure::WorkingDirectoryMissing { .. } => {
                f.write_str("WorkingDirectoryMissing { .. }")
            }
            SessionFailure::WslUnavailable { distro } => f
                .debug_struct("WslUnavailable")
                .field("distro", distro)
                .finish(),
            SessionFailure::WslCommandNotFound { distro } => f
                .debug_struct("WslCommandNotFound")
                .field("distro", distro)
                .finish(),
            SessionFailure::EndedAbnormally(failure) => {
                f.debug_tuple("EndedAbnormally").field(failure).finish()
            }
            SessionFailure::VersionCheckFailed(failure) => {
                f.debug_tuple("VersionCheckFailed").field(failure).finish()
            }
            SessionFailure::CommandNotFound
            | SessionFailure::ScriptOnly
            | SessionFailure::TooManyProcesses
            | SessionFailure::PlanFailed => f.write_str(self.kind()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failures_are_sorted_by_where_they_came_from() {
        assert_eq!(
            SessionFailure::from_exit(ProcessFailure::Exit(127)),
            SessionFailure::CommandNotFound
        );
        assert_eq!(
            SessionFailure::from_exit(ProcessFailure::Exit(3)),
            SessionFailure::EndedAbnormally(ProcessFailure::Exit(3))
        );
        assert_eq!(
            SessionFailure::from_exit(ProcessFailure::Io(ErrorKind::BrokenPipe)),
            SessionFailure::EndedAbnormally(ProcessFailure::Io(ErrorKind::BrokenPipe))
        );
        assert_eq!(
            SessionFailure::from_launch(&LaunchError::Spawn(ErrorKind::PermissionDenied)),
            SessionFailure::LaunchFailed {
                kind: ErrorKind::PermissionDenied
            }
        );
        assert_eq!(
            SessionFailure::from_launch(&LaunchError::CommandNotFound),
            SessionFailure::CommandNotFound
        );
        assert_eq!(
            SessionFailure::from_launch(&LaunchError::ScriptOnly),
            SessionFailure::ScriptOnly
        );
        assert_eq!(
            SessionFailure::from_launch(&LaunchError::TooManyProcesses),
            SessionFailure::TooManyProcesses
        );
        assert_eq!(
            SessionFailure::from_launch(&LaunchError::WslUnavailable {
                distro: "Ubuntu".into()
            }),
            SessionFailure::WslUnavailable {
                distro: "Ubuntu".into()
            }
        );
        assert_eq!(
            SessionFailure::from_version(VersionFailure::Exit(127)),
            SessionFailure::CommandNotFound
        );
        assert_eq!(
            SessionFailure::from_version(VersionFailure::Spawn(LaunchError::Spawn(
                ErrorKind::PermissionDenied
            ))),
            SessionFailure::LaunchFailed {
                kind: ErrorKind::PermissionDenied
            }
        );
        for failure in [
            VersionFailure::Exit(1),
            VersionFailure::NoAnswer,
            VersionFailure::NoOutput,
            VersionFailure::NotAVersion,
        ] {
            assert_eq!(
                SessionFailure::from_version(failure.clone()),
                SessionFailure::VersionCheckFailed(failure)
            );
        }
    }

    #[test]
    fn a_missing_working_folder_is_told_apart_from_a_missing_command() {
        let missing = SessionFailure::from_launch(&LaunchError::WorkingDirectoryMissing {
            path: "/work/wt".into(),
        });
        assert_eq!(
            missing,
            SessionFailure::WorkingDirectoryMissing {
                path: "/work/wt".into()
            }
        );
        assert_ne!(missing, SessionFailure::CommandNotFound);
        assert_eq!(missing.kind(), "WorkingDirectoryMissing");
        assert_eq!(SessionFailure::CommandNotFound.kind(), "CommandNotFound");
        // The version check could not start for the same reason.
        assert_eq!(
            SessionFailure::from_version(VersionFailure::Spawn(
                LaunchError::WorkingDirectoryMissing {
                    path: "/work/wt".into()
                }
            )),
            missing
        );
    }

    #[test]
    fn a_127_in_wsl_names_the_distribution_and_elsewhere_stays_command_not_found() {
        assert_eq!(
            SessionFailure::CommandNotFound.for_spawner(Some("Ubuntu")),
            SessionFailure::WslCommandNotFound {
                distro: "Ubuntu".into()
            }
        );
        assert_eq!(
            SessionFailure::CommandNotFound.for_spawner(None),
            SessionFailure::CommandNotFound
        );
        let abnormal = SessionFailure::EndedAbnormally(ProcessFailure::Exit(3));
        assert_eq!(abnormal.clone().for_spawner(Some("Ubuntu")), abnormal);
        assert_eq!(
            SessionFailure::from_exit(ProcessFailure::Exit(127)).for_spawner(Some("Ubuntu")),
            SessionFailure::WslCommandNotFound {
                distro: "Ubuntu".into()
            }
        );
    }

    #[test]
    fn debug_and_kind_name_no_path() {
        let missing = SessionFailure::WorkingDirectoryMissing {
            path: "/home/someone/x".into(),
        };
        let debug = format!("{missing:?}");
        assert!(!debug.contains("someone"), "{debug}");
        assert!(debug.contains("WorkingDirectoryMissing"), "{debug}");
        assert!(!missing.kind().contains("someone"));
        let failed = format!("{:?}", SessionStatus::Failed(missing));
        assert!(!failed.contains("someone"), "{failed}");
    }

    #[test]
    fn every_kind_is_the_variant_name() {
        let named = [
            (
                SessionFailure::LaunchFailed {
                    kind: ErrorKind::NotFound,
                },
                "LaunchFailed",
            ),
            (
                SessionFailure::WslUnavailable { distro: "d".into() },
                "WslUnavailable",
            ),
            (
                SessionFailure::WslCommandNotFound { distro: "d".into() },
                "WslCommandNotFound",
            ),
            (SessionFailure::ScriptOnly, "ScriptOnly"),
            (SessionFailure::TooManyProcesses, "TooManyProcesses"),
            (
                SessionFailure::EndedAbnormally(ProcessFailure::Exit(3)),
                "EndedAbnormally",
            ),
            (
                SessionFailure::VersionCheckFailed(VersionFailure::NoAnswer),
                "VersionCheckFailed",
            ),
            (SessionFailure::PlanFailed, "PlanFailed"),
        ];
        for (failure, kind) in named {
            assert_eq!(failure.kind(), kind);
        }
    }

    #[test]
    fn only_the_three_ends_are_ends() {
        assert!(!SessionStatus::Starting.is_end());
        assert!(
            !SessionStatus::Running {
                version: "2.1.282".into()
            }
            .is_end()
        );
        assert!(SessionStatus::Ended.is_end());
        assert!(SessionStatus::Failed(SessionFailure::PlanFailed).is_end());
        assert!(SessionStatus::Closed.is_end());
    }
}
