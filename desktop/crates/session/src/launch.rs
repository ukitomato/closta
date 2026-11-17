//! How one session's `claude` is started. SessionLaunch.kt and WslLaunching.kt.

use std::fmt;
use std::sync::Arc;

use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::spec::LaunchSpec;
use closta_providers::claude::launch::wsl::WslLocation;
use closta_providers::claude::process::ProcessSpawner;
use futures_lite::future;

use crate::log::SessionLog;
use crate::status::SessionFailure;

/// The spawner that creates the process and the spec it runs.
///
/// `Debug` is written by hand: the spec carries the launch environment, which holds
/// credentials once a provider supplies them, and the working folder. Only the argv is shown.
#[derive(Clone)]
pub struct SessionLaunch {
    pub spawner: Arc<dyn ProcessSpawner>,
    pub spec: LaunchSpec,
}

impl fmt::Debug for SessionLaunch {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.spec.to_args() {
            Ok(args) => write!(f, "SessionLaunch(argv={args:?})"),
            Err(_) => write!(f, "SessionLaunch(argv=invalid)"),
        }
    }
}

/// Produces the [`SessionLaunch`] for a new session. It is asynchronous because a planner may
/// read secrets, which can block. A failure is one the planner can name.
pub trait SessionLaunchPlanner: Send + Sync {
    fn plan(
        &self,
        session_id: &str,
        working_directory: Option<&str>,
    ) -> future::Boxed<Result<SessionLaunch, SessionFailure>>;
}

/// `claude` on this machine in the project, with the environment `env` gives at each plan, its
/// permission prompts put on stdio. In production the spawner is
/// `NativeSpawner::new(NativeProgram::Claude, BTreeSet::new())`. WSL is a different spawner,
/// laid over this plan by [`WslAwarePlanner`].
pub struct NativeSessionLaunchPlanner {
    spawner: Arc<dyn ProcessSpawner>,
    env: Arc<dyn Fn() -> SecretEnv + Send + Sync>,
}

impl NativeSessionLaunchPlanner {
    pub fn new(
        spawner: Arc<dyn ProcessSpawner>,
        env: Arc<dyn Fn() -> SecretEnv + Send + Sync>,
    ) -> NativeSessionLaunchPlanner {
        NativeSessionLaunchPlanner { spawner, env }
    }
}

impl SessionLaunchPlanner for NativeSessionLaunchPlanner {
    fn plan(
        &self,
        session_id: &str,
        working_directory: Option<&str>,
    ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
        let spawner = Arc::clone(&self.spawner);
        let env = Arc::clone(&self.env);
        let session_id = session_id.to_owned();
        let cwd = working_directory.map(str::to_owned);
        Box::pin(async move {
            Ok(SessionLaunch {
                spawner,
                spec: LaunchSpec {
                    cwd,
                    env: env(),
                    permission_prompt_tool_stdio: true,
                    ..LaunchSpec::new(&session_id)
                },
            })
        })
    }
}

/// The spawner that starts in a WSL distribution.
pub type SpawnerFor = dyn Fn(&WslLocation) -> Arc<dyn ProcessSpawner> + Send + Sync;

/// Starts a WSL project's `claude` in its distribution: what `inner` plans is kept as it is,
/// and only the spawner is replaced by `spawner_for`. With no `location` (not a WSL project, or
/// not on Windows) the plan is returned as it came. One line says where `claude` starts.
pub struct WslAwarePlanner {
    inner: Arc<dyn SessionLaunchPlanner>,
    location: Option<WslLocation>,
    spawner_for: Arc<SpawnerFor>,
    log: Arc<dyn SessionLog>,
}

impl WslAwarePlanner {
    pub fn new(
        inner: Arc<dyn SessionLaunchPlanner>,
        location: Option<WslLocation>,
        spawner_for: Arc<SpawnerFor>,
        log: Arc<dyn SessionLog>,
    ) -> WslAwarePlanner {
        WslAwarePlanner {
            inner,
            location,
            spawner_for,
            log,
        }
    }
}

impl SessionLaunchPlanner for WslAwarePlanner {
    fn plan(
        &self,
        session_id: &str,
        working_directory: Option<&str>,
    ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
        let planned = self.inner.plan(session_id, working_directory);
        let location = self.location.clone();
        let spawner_for = Arc::clone(&self.spawner_for);
        let log = Arc::clone(&self.log);
        let session_id = session_id.to_owned();
        Box::pin(async move {
            let launch = planned.await?;
            let Some(location) = location else {
                return Ok(launch);
            };
            // Not the folder: a path holds the user's name.
            log.info(&format!(
                "claude session {session_id}: launching in WSL {}",
                location.distro
            ));
            Ok(SessionLaunch {
                spawner: spawner_for(&location),
                spec: launch.spec,
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use std::io::ErrorKind;
    use std::sync::{Mutex, PoisonError};

    use closta_providers::claude::fake::spawner::FakeSpawner;
    use closta_providers::claude::launch::LaunchError;
    use futures_lite::future::block_on;

    use super::*;

    const SECRET: &str = "sk-secret";
    const FOLDER: &str = "/work/private-folder";

    fn never() -> Arc<dyn ProcessSpawner> {
        Arc::new(FakeSpawner::answering(|_| {
            Err(LaunchError::CommandNotFound)
        }))
    }

    fn secret_env() -> SecretEnv {
        let mut env = SecretEnv::default();
        env.insert("ANTHROPIC_API_KEY", SECRET);
        env
    }

    /// The lines a planner logs, at both levels.
    #[derive(Default)]
    struct Lines {
        infos: Mutex<Vec<String>>,
        warns: Mutex<Vec<String>>,
    }

    impl Lines {
        fn infos(&self) -> Vec<String> {
            self.infos
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .clone()
        }

        fn all(&self) -> Vec<String> {
            let mut all = self.infos();
            all.extend(
                self.warns
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .iter()
                    .cloned(),
            );
            all
        }
    }

    impl SessionLog for Lines {
        fn info(&self, line: &str) {
            self.infos
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(line.to_owned());
        }

        fn warn(&self, line: &str) {
            self.warns
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(line.to_owned());
        }
    }

    /// A planner that always gives the same launch.
    struct Fixed(SessionLaunch);

    impl SessionLaunchPlanner for Fixed {
        fn plan(
            &self,
            _session_id: &str,
            _working_directory: Option<&str>,
        ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
            Box::pin(future::ready(Ok(self.0.clone())))
        }
    }

    fn plain() -> SessionLaunch {
        SessionLaunch {
            spawner: never(),
            spec: LaunchSpec {
                cwd: Some(FOLDER.to_owned()),
                env: secret_env(),
                ..LaunchSpec::new("s1")
            },
        }
    }

    fn ubuntu() -> WslLocation {
        WslLocation {
            distro: "Ubuntu".to_owned(),
            linux_path: "/home/u/p".to_owned(),
        }
    }

    #[test]
    fn the_claude_command_line_routes_permission_prompts_to_the_host_over_stdio() {
        let planner = NativeSessionLaunchPlanner::new(never(), Arc::new(SecretEnv::default));

        let args = block_on(planner.plan("s1", Some("/work")))
            .expect("a plan")
            .spec
            .to_args()
            .expect("valid args");

        let flag = args
            .iter()
            .position(|it| it == "--permission-prompt-tool")
            .unwrap_or_else(|| panic!("no flag in {args:?}"));
        assert_eq!(Some("stdio"), args.get(flag + 1).map(String::as_str));
    }

    #[test]
    fn the_native_planner_gives_its_env_and_folder() {
        let spawner = never();
        let planner = NativeSessionLaunchPlanner::new(Arc::clone(&spawner), Arc::new(secret_env));

        let launch = block_on(planner.plan("s1", Some(FOLDER))).expect("a plan");

        assert!(Arc::ptr_eq(&spawner, &launch.spawner));
        assert_eq!("s1", launch.spec.session_id);
        assert_eq!(Some(FOLDER), launch.spec.cwd.as_deref());
        assert_eq!(secret_env(), launch.spec.env);
        assert!(!format!("{launch:?}").contains(SECRET));
    }

    #[test]
    fn a_project_outside_wsl_keeps_the_launch_it_was_planned_with_and_logs_nothing() {
        let plain = plain();
        let lines = Arc::new(Lines::default());
        let planner = WslAwarePlanner::new(
            Arc::new(Fixed(plain.clone())),
            None,
            Arc::new(|_: &WslLocation| never()),
            lines.clone(),
        );

        let launch = block_on(planner.plan("s1", Some(FOLDER))).expect("a plan");

        assert!(Arc::ptr_eq(&plain.spawner, &launch.spawner));
        assert!(plain.spec == launch.spec);
        assert!(lines.all().is_empty());
    }

    #[test]
    fn a_wsl_project_keeps_the_planned_spec_and_gets_the_wsl_spawner() {
        let plain = plain();
        let wsl = never();
        let asked = Arc::new(Mutex::new(Vec::new()));
        let spawner_for = {
            let wsl = Arc::clone(&wsl);
            let asked = Arc::clone(&asked);
            move |location: &WslLocation| {
                asked
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .push(location.clone());
                Arc::clone(&wsl)
            }
        };
        let planner = WslAwarePlanner::new(
            Arc::new(Fixed(plain.clone())),
            Some(ubuntu()),
            Arc::new(spawner_for),
            Arc::new(Lines::default()),
        );

        let launch = block_on(planner.plan("s1", Some(FOLDER))).expect("a plan");

        assert!(plain.spec == launch.spec);
        assert!(Arc::ptr_eq(&wsl, &launch.spawner));
        assert!(vec![ubuntu()] == *asked.lock().unwrap_or_else(PoisonError::into_inner));
    }

    #[test]
    fn one_line_says_it_starts_in_wsl_without_the_folder_and_no_line_holds_an_env_value() {
        let lines = Arc::new(Lines::default());
        let planner = WslAwarePlanner::new(
            Arc::new(Fixed(plain())),
            Some(ubuntu()),
            Arc::new(|_: &WslLocation| never()),
            lines.clone(),
        );

        block_on(planner.plan("s1", Some(FOLDER))).expect("a plan");

        // The folder is a path with the user's name in it: the log names the distribution only.
        assert_eq!(
            vec!["claude session s1: launching in WSL Ubuntu".to_owned()],
            lines.infos()
        );
        assert!(!lines.all().iter().any(|it| it.contains(SECRET)));
    }

    #[test]
    fn a_wsl_launch_that_cannot_be_made_is_its_own_failure_and_the_other_failures_stay() {
        // The sentences of Kotlin's failure (cause, remedy) are the platform's work here.
        assert_eq!(
            SessionFailure::WslUnavailable {
                distro: "Ubuntu".to_owned()
            },
            SessionFailure::from_launch(&LaunchError::WslUnavailable {
                distro: "Ubuntu".to_owned()
            })
        );
        assert_eq!(
            SessionFailure::WorkingDirectoryMissing {
                path: "/gone".to_owned()
            },
            SessionFailure::from_launch(&LaunchError::WorkingDirectoryMissing {
                path: "/gone".to_owned()
            })
        );
        assert_eq!(
            SessionFailure::LaunchFailed {
                kind: ErrorKind::Other
            },
            SessionFailure::from_launch(&LaunchError::Spawn(ErrorKind::Other))
        );
    }

    #[test]
    fn session_launch_debug_shows_the_argv_only() {
        let launch = plain();

        let shown = format!("{launch:?}");

        let args = launch.spec.to_args().expect("valid args");
        assert_eq!(format!("SessionLaunch(argv={args:?})"), shown);
        assert!(!shown.contains(SECRET), "{shown}");
        assert!(!shown.contains(FOLDER), "{shown}");
        let invalid = SessionLaunch {
            spawner: never(),
            spec: LaunchSpec {
                fork_session: true,
                ..LaunchSpec::new("s1")
            },
        };
        assert_eq!("SessionLaunch(argv=invalid)", format!("{invalid:?}"));
    }
}
