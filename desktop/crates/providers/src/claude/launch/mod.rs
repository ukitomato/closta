//! Launching `claude`: what to run it with and why it could not start. Mirrors
//! ClaudeLaunchSpec.kt, AnthropicLaunch.kt and the failures of ProcessSpawner.kt.

pub mod cli_paths;
pub mod env;
pub mod probe;
pub mod spawn;
pub mod spec;
pub mod version;
pub mod wsl;

use std::fmt;

use env::SecretEnv;
use spec::{LaunchSpec, SpecError};

/// One process to start: the arguments after the program name, the environment laid over the
/// inherited one, and the working folder. Which program runs is the runtime's choice.
#[derive(Clone)]
pub struct Launch {
    pub args: Vec<String>,
    pub env: SecretEnv,
    pub cwd: Option<String>,
}

impl Launch {
    /// The conversation's process for `spec`.
    pub fn of(spec: &LaunchSpec) -> Result<Launch, SpecError> {
        Ok(Launch {
            args: spec.to_args()?,
            env: spec.child_env(),
            cwd: spec.cwd.clone(),
        })
    }

    /// `claude --version` in the same environment and folder.
    #[must_use]
    pub fn version_check(&self) -> Launch {
        Launch {
            args: vec!["--version".to_owned()],
            env: self.env.clone(),
            cwd: self.cwd.clone(),
        }
    }
}

// Written by hand: env shows only its count and cwd is left out, as a path names the user.
impl fmt::Debug for Launch {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Launch")
            .field("args", &self.args)
            .field("env", &self.env)
            .finish_non_exhaustive()
    }
}

/// The environment of a direct Anthropic launch: only the optional `ANTHROPIC_MODEL`, never an
/// AWS or Bedrock switch. An API key, if any, is merged by the caller, not here.
pub fn anthropic_env(model: Option<&str>) -> SecretEnv {
    let mut env = SecretEnv::default();
    if let Some(model) = model {
        env.insert("ANTHROPIC_MODEL", model);
    }
    env
}

/// Why a process could not be started. The messages name no path and no env value.
#[derive(Clone, PartialEq, Eq, thiserror::Error)]
pub enum LaunchError {
    /// The process could not be made and its working folder is not a folder.
    #[error("the working folder was not found")]
    WorkingDirectoryMissing { path: String },
    /// The WSL distribution is not installed, or the folder is not in it.
    #[error("the WSL distribution {distro} is not available")]
    WslUnavailable { distro: String },
    /// Only a script (`.cmd`, `.bat`, `.ps1`) of `claude` was found, which is not run.
    #[error("only a script of claude was found, not claude.exe")]
    ScriptOnly,
    /// No `claude` was found.
    #[error("claude was not found")]
    CommandNotFound,
    /// Too many children are alive to start another.
    #[error("too many claude processes are running")]
    TooManyProcesses,
    /// The OS refused to start the process.
    #[error("the process could not be started ({0:?})")]
    Spawn(std::io::ErrorKind),
}

// Written by hand so that the missing folder's path is not shown.
impl fmt::Debug for LaunchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LaunchError::WorkingDirectoryMissing { .. } => {
                f.write_str("WorkingDirectoryMissing { .. }")
            }
            LaunchError::WslUnavailable { distro } => f
                .debug_struct("WslUnavailable")
                .field("distro", distro)
                .finish(),
            LaunchError::ScriptOnly => f.write_str("ScriptOnly"),
            LaunchError::CommandNotFound => f.write_str("CommandNotFound"),
            LaunchError::TooManyProcesses => f.write_str("TooManyProcesses"),
            LaunchError::Spawn(kind) => f.debug_tuple("Spawn").field(kind).finish(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use spec::CHECKPOINTING_ENV;

    #[test]
    fn anthropic_env_with_a_model_is_only_anthropic_model() {
        let env = anthropic_env(Some("opus"));
        assert_eq!(
            env.iter().collect::<Vec<_>>(),
            [("ANTHROPIC_MODEL", "opus")]
        );
        // The direct-API path carries no Bedrock or AWS switch.
        assert_eq!(env.get("CLAUDE_CODE_USE_BEDROCK"), None);
        assert!(!env.names().any(|n| n.starts_with("AWS_")));
    }

    #[test]
    fn anthropic_env_without_a_model_is_empty() {
        assert!(anthropic_env(None).is_empty());
    }

    #[test]
    fn a_launch_carries_the_args_the_child_env_and_the_folder() {
        let mut spec = LaunchSpec::new("s");
        spec.env.insert("K", "v");
        spec.cwd = Some("/work".to_owned());
        let launch = Launch::of(&spec).expect("a valid spec");
        assert_eq!(launch.args, spec.to_args().expect("valid"));
        assert_eq!(launch.env, spec.child_env());
        assert_eq!(launch.env.get(CHECKPOINTING_ENV), Some("true"));
        assert_eq!(launch.cwd.as_deref(), Some("/work"));

        let version = launch.version_check();
        assert_eq!(version.args, ["--version"]);
        assert_eq!(version.env, launch.env);
        assert_eq!(version.cwd, launch.cwd);
    }

    #[test]
    fn a_launch_of_a_contradicting_spec_is_the_spec_error() {
        let mut spec = LaunchSpec::new("s");
        spec.fork_session = true;
        assert_eq!(
            Launch::of(&spec).map(|l| l.args),
            Err(SpecError::ForkWithoutResume)
        );
    }

    // Deliberate difference from Kotlin: LaunchSpec's Debug hides cwd, which Kotlin's toString showed.
    #[test]
    fn debug_shows_no_env_value_and_no_cwd() {
        let mut spec = LaunchSpec::new("s");
        spec.env.insert("ANTHROPIC_API_KEY", "sk-secret");
        spec.cwd = Some("/home/someone/project".to_owned());
        let launch = Launch::of(&spec).expect("a valid spec");
        for shown in [
            format!("{spec:?}"),
            format!("{launch:?}"),
            format!("{:?}", spec.env),
        ] {
            assert!(!shown.contains("sk-secret"), "{shown}");
            assert!(!shown.contains("someone"), "{shown}");
        }
        assert!(format!("{launch:?}").contains("--session-id=s"));

        let missing = LaunchError::WorkingDirectoryMissing {
            path: "/home/someone/x".to_owned(),
        };
        assert!(!format!("{missing:?}").contains("someone"));
        assert!(!missing.to_string().contains("someone"));
    }

    #[test]
    fn a_wsl_failure_names_its_distribution() {
        let error = LaunchError::WslUnavailable {
            distro: "Ubuntu-26.04".to_owned(),
        };
        assert!(error.to_string().contains("Ubuntu-26.04"));
        assert!(format!("{error:?}").contains("Ubuntu-26.04"));
    }
}
