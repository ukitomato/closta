//! The checks' launches: real folders opened from the command line, the mark and the MCP
//! configuration their processes are started with, and a launch made to fail. Only in the
//! replay build.

use std::path::Path;
use std::sync::Arc;

use closta_providers::claude::fake::process::{ProcessScript, ProcessTermination};
use closta_providers::claude::fake::spawner::FakeSpawner;
use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{AgentProcess, ProcessFailure, ProcessSpawner};
use closta_session::launch::{NativeSessionLaunchPlanner, SessionLaunch, SessionLaunchPlanner};
use closta_session::status::SessionFailure;
use closta_shell::new_session::{PlannerFor, Problem, launch_in, problem_text, quick_problem};
use closta_shell::slot::SlotLaunch;
use closta_shell::state::Ports;
use futures_lite::future;

/// The environment variable that marks the processes of a check's run, children included.
pub const MARK_ENV: &str = "CLOSTA_SMOKE_MARK";

/// The version the failing launch's `--version` answers.
const FAIL_VERSION: &str = "2.1.282 (Claude Code)";

/// The planners of `inner`, with `mark` in each session's environment and `--mcp-config
/// <mcp_config>` after each session's arguments.
pub struct ProbePlannerFor {
    pub inner: Arc<dyn PlannerFor>,
    pub mark: Option<String>,
    pub mcp_config: Option<String>,
}

impl PlannerFor for ProbePlannerFor {
    fn planner(&self, folder: &str) -> Arc<dyn SessionLaunchPlanner> {
        Arc::new(ProbePlanner {
            inner: self.inner.planner(folder),
            mark: self.mark.clone(),
            mcp_config: self.mcp_config.clone(),
        })
    }
}

struct ProbePlanner {
    inner: Arc<dyn SessionLaunchPlanner>,
    mark: Option<String>,
    mcp_config: Option<String>,
}

impl SessionLaunchPlanner for ProbePlanner {
    fn plan(
        &self,
        session_id: &str,
        working_directory: Option<&str>,
    ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
        let planned = self.inner.plan(session_id, working_directory);
        let mark = self.mark.clone();
        let mcp_config = self.mcp_config.clone();
        Box::pin(async move {
            let SessionLaunch {
                mut spawner,
                mut spec,
            } = planned.await?;
            if let Some(mark) = mark {
                spec.env.insert(MARK_ENV, mark);
            }
            // Added by the spawner, after the session has logged its arguments: the path is
            // never in the log.
            if let Some(path) = mcp_config {
                spawner = Arc::new(ExtraArgsSpawner {
                    inner: spawner,
                    extra: vec!["--mcp-config".to_owned(), path],
                });
            }
            Ok(SessionLaunch { spawner, spec })
        })
    }
}

/// Starts what `inner` starts, with `extra` after the arguments of every launch but the
/// version check.
struct ExtraArgsSpawner {
    inner: Arc<dyn ProcessSpawner>,
    extra: Vec<String>,
}

impl ProcessSpawner for ExtraArgsSpawner {
    fn spawn(&self, launch: &Launch) -> Result<Box<dyn AgentProcess>, LaunchError> {
        if launch.args == ["--version"] {
            return self.inner.spawn(launch);
        }
        let mut launch = launch.clone();
        launch.args.extend(self.extra.iter().cloned());
        self.inner.spawn(&launch)
    }

    fn wsl_distro(&self) -> Option<&str> {
        self.inner.wsl_distro()
    }
}

/// A slot whose version check answers and whose session's process ends with `code`, as one
/// started in the WSL distribution `distro` when there is one. Its Restart fails the same way.
pub fn fail_launch(code: i32, distro: Option<String>) -> SlotLaunch {
    let spawner = FakeSpawner::new(move |launch| {
        Ok(if launch.args == ["--version"] {
            ProcessScript::replaying(vec![FAIL_VERSION.to_owned()])
        } else {
            ProcessScript {
                beats: Vec::new(),
                termination: ProcessTermination::Error(ProcessFailure::Exit(code)),
                stdin_fails: false,
            }
        })
    });
    let spawner = match &distro {
        Some(distro) => spawner.with_wsl_distro(distro),
        None => spawner,
    };
    SlotLaunch {
        title: "fail-launch".to_owned(),
        planner: Arc::new(NativeSessionLaunchPlanner::new(
            Arc::new(spawner),
            Arc::new(SecretEnv::default),
        )),
        working_directory: None,
        companion: None,
        relaunch: Some(Arc::new(move || fail_launch(code, distro.clone()))),
        settles_on_failure: true,
    }
}

/// The slot of a real `claude` in `folder`, if the folder lacks nothing the New Session dialog
/// would refuse it for; otherwise the dialog's words for what it lacks (no path).
pub fn open_folder(folder: &str, ports: &Ports) -> Result<SlotLaunch, String> {
    if let Some(problem) = quick_problem(folder, ports.checks.as_ref()) {
        return Err(problem_text(&problem));
    }
    if !Path::new(folder.trim()).is_dir() {
        return Err(problem_text(&Problem::FolderMissing));
    }
    Ok(launch_in(folder, &ports.planner_for))
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use closta_providers::claude::launch::spec::LaunchSpec;
    use closta_session::log::SessionLog;
    use closta_session::runtime::{SessionConfig, SessionRuntime};
    use closta_session::status::SessionStatus;
    use closta_shell::new_session::{ClaudeOnPath, LaunchChecks};

    use super::*;

    const MCP: &str = "/tmp/closta-check/mcp.json";

    struct Fixed(Arc<FakeSpawner>);

    impl SessionLaunchPlanner for Fixed {
        fn plan(
            &self,
            session_id: &str,
            working_directory: Option<&str>,
        ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
            let launch = SessionLaunch {
                spawner: Arc::clone(&self.0) as _,
                spec: LaunchSpec {
                    cwd: working_directory.map(str::to_owned),
                    ..LaunchSpec::new(session_id)
                },
            };
            Box::pin(async move { Ok(launch) })
        }
    }

    struct FixedFor(Arc<FakeSpawner>);

    impl PlannerFor for FixedFor {
        fn planner(&self, _folder: &str) -> Arc<dyn SessionLaunchPlanner> {
            Arc::new(Fixed(Arc::clone(&self.0)))
        }
    }

    fn inner_spawner() -> Arc<FakeSpawner> {
        Arc::new(
            FakeSpawner::new(|_| Ok(ProcessScript::replaying(Vec::new())))
                .with_wsl_distro("Ubuntu-26.04"),
        )
    }

    #[test]
    fn the_mark_and_the_mcp_config_go_to_the_session_only() {
        let inner = inner_spawner();
        let probe = ProbePlannerFor {
            inner: Arc::new(FixedFor(Arc::clone(&inner))),
            mark: Some("run-7".to_owned()),
            mcp_config: Some(MCP.to_owned()),
        };
        let planned = smol::block_on(probe.planner("C:\\x").plan("s1", Some("C:\\x"))).unwrap();
        assert_eq!(planned.spawner.wsl_distro(), Some("Ubuntu-26.04"));
        assert_eq!(planned.spec.env.get(MARK_ENV), Some("run-7"));

        // What the session logs is the spec's argv and the launch's Debug: neither holds the
        // configuration's path or the mark.
        let session = Launch::of(&planned.spec).unwrap();
        assert!(!session.args.iter().any(|arg| arg == MCP), "{session:?}");
        for logged in [format!("{session:?}"), format!("{planned:?}")] {
            assert!(!logged.contains(MCP), "{logged}");
            assert!(!logged.contains("run-7"), "{logged}");
        }

        planned.spawner.spawn(&session).map(drop).unwrap();
        planned
            .spawner
            .spawn(&session.version_check())
            .map(drop)
            .unwrap();
        let launches = inner.launches();
        let started = &launches[0];
        assert_eq!(started.args[..session.args.len()], session.args[..]);
        assert_eq!(
            started.args[session.args.len()..],
            ["--mcp-config".to_owned(), MCP.to_owned()]
        );
        assert_eq!(started.env.get(MARK_ENV), Some("run-7"));
        assert_eq!(launches[1].args, ["--version"]);
    }

    #[test]
    fn without_a_mark_or_a_configuration_the_launch_is_as_planned() {
        let inner = inner_spawner();
        let probe = ProbePlannerFor {
            inner: Arc::new(FixedFor(Arc::clone(&inner))),
            mark: None,
            mcp_config: None,
        };
        let planned = smol::block_on(probe.planner("C:\\x").plan("s1", None)).unwrap();
        assert_eq!(planned.spec.env.get(MARK_ENV), None);
        let session = Launch::of(&planned.spec).unwrap();
        planned.spawner.spawn(&session).map(drop).unwrap();
        assert_eq!(inner.launches()[0].args, session.args);
    }

    struct Quiet;

    impl SessionLog for Quiet {
        fn info(&self, _line: &str) {}

        fn warn(&self, _line: &str) {}
    }

    #[test]
    fn a_fail_launch_slot_fails_with_its_code_in_its_distro() {
        let executor = smol::Executor::new();
        smol::block_on(executor.run(async {
            let launch = fail_launch(127, Some("Ubuntu-26.04".to_owned()));
            assert!(launch.settles_on_failure);
            assert_eq!(launch.title, "fail-launch");
            assert!(
                launch
                    .relaunch
                    .as_ref()
                    .is_some_and(|it| it().settles_on_failure)
            );
            let config = SessionConfig::new("s1", launch.planner, None, Arc::new(Quiet));
            let (runtime, run) = SessionRuntime::new(config);
            executor.spawn(run).detach();
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            while !runtime.status().is_end() {
                assert!(
                    std::time::Instant::now() < deadline,
                    "{:?}",
                    runtime.status()
                );
                smol::Timer::after(Duration::from_millis(10)).await;
            }
            assert_eq!(
                runtime.status(),
                SessionStatus::Failed(SessionFailure::WslCommandNotFound {
                    distro: "Ubuntu-26.04".to_owned()
                })
            );
        }));
    }

    struct Machine;

    impl LaunchChecks for Machine {
        fn installed_distros(&self) -> Vec<String> {
            vec!["Ubuntu-26.04".to_owned()]
        }
        fn claude_on_path(&self) -> ClaudeOnPath {
            ClaudeOnPath::Found
        }
        fn default_distro(&self) -> Option<String> {
            None
        }
        fn folder_exists(&self, _folder: &str) -> future::Boxed<bool> {
            Box::pin(async { true })
        }
    }

    #[test]
    fn an_open_folder_lacking_something_is_refused_without_its_path() {
        let ports = Ports {
            checks: Arc::new(Machine),
            planner_for: Arc::new(FixedFor(inner_spawner())),
        };
        let here = std::env::temp_dir().to_string_lossy().into_owned();
        let launch = open_folder(&here, &ports).unwrap();
        assert_eq!(launch.working_directory.as_deref(), Some(here.trim()));
        assert!(!launch.settles_on_failure);

        let gone = std::env::temp_dir()
            .join("closta-no-such-folder")
            .to_string_lossy()
            .into_owned();
        let Err(error) = open_folder(&gone, &ports) else {
            panic!("a missing folder was opened");
        };
        assert_eq!(error, problem_text(&Problem::FolderMissing));
        assert!(!error.contains("closta-no-such-folder"), "{error}");

        let Err(error) = open_folder(r"\\wsl.localhost\Debian\home\secret", &ports) else {
            panic!("a folder in a missing distribution was opened");
        };
        assert_eq!(
            error,
            problem_text(&Problem::DistroMissing("Debian".to_owned()))
        );
        assert!(!error.contains("secret"), "{error}");
    }
}
