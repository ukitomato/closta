#![allow(dead_code, clippy::expect_used, clippy::unwrap_used)]
//! The shell's test harness: a shell over sessions made of in-memory processes.

use std::collections::VecDeque;
use std::future::Future;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use closta_model::AppInfo;
use closta_providers::claude::fake::live::{LiveControl, LiveOptions, LiveProcess};
use closta_providers::claude::fake::process::{FakeProcess, ProcessScript};
use closta_providers::claude::fake::spawner::FakeSpawner;
use closta_providers::claude::launch::Launch;
use closta_providers::claude::launch::LaunchError;
use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::process::AgentProcess;
use closta_session::launch::{NativeSessionLaunchPlanner, SessionLaunchPlanner};
use closta_session::log::SessionLog;
use closta_session::runtime::SessionRuntime;
use closta_session::status::SessionStatus;
use closta_shell::header::app_header;
use closta_shell::new_session::{ClaudeOnPath, LaunchChecks, PlannerFor};
use closta_shell::slot::{SlotLaunch, Spawn};
use closta_shell::state::{Ports, ShellState};
use futures_lite::future;
use smol::{Executor, Timer};

pub const TIMEOUT: Duration = Duration::from_secs(30);
pub const GUARD: Duration = Duration::from_secs(10);

pub struct Quiet;

impl SessionLog for Quiet {
    fn info(&self, _line: &str) {}

    fn warn(&self, _line: &str) {}
}

/// What the fake spawner hands the next session launches: a live process unless a refusal is
/// queued.
#[derive(Default)]
pub struct Answers {
    pub refusals: VecDeque<LaunchError>,
    /// Whether the next processes keep running when told to end.
    pub stubborn: bool,
    pub controls: Vec<LiveControl>,
}

pub struct Harness {
    pub executor: Arc<Executor<'static>>,
    pub answers: Arc<Mutex<Answers>>,
    pub planner: Arc<NativeSessionLaunchPlanner>,
}

impl Harness {
    pub fn new(executor: Arc<Executor<'static>>) -> Harness {
        let answers = Arc::new(Mutex::new(Answers::default()));
        let held = Arc::clone(&answers);
        let spawner = FakeSpawner::answering(move |launch: &Launch| {
            if launch.args == ["--version"] {
                let script = ProcessScript::replaying(vec!["2.1.282 (Claude Code)".to_owned()]);
                let (process, _probe) = FakeProcess::new(script);
                return Ok(Box::new(process) as Box<dyn AgentProcess>);
            }
            let mut answers = held.lock().unwrap_or_else(PoisonError::into_inner);
            if let Some(error) = answers.refusals.pop_front() {
                return Err(error);
            }
            let options = LiveOptions {
                exit_on_destroy: if answers.stubborn { None } else { Some(0) },
                ..LiveOptions::default()
            };
            let (process, control) = LiveProcess::new(options);
            answers.controls.push(control);
            Ok(Box::new(process) as Box<dyn AgentProcess>)
        });
        let planner = Arc::new(NativeSessionLaunchPlanner::new(
            Arc::new(spawner),
            Arc::new(SecretEnv::default),
        ));
        Harness {
            executor,
            answers,
            planner,
        }
    }

    pub fn shell(&self) -> ShellState {
        self.shell_with(self.ports())
    }

    pub fn shell_with(&self, ports: Ports) -> ShellState {
        let executor = Arc::clone(&self.executor);
        let spawn: Spawn = Arc::new(move |run| executor.spawn(run).detach());
        let header = app_header(&AppInfo {
            name: "Closta".into(),
            version: "0.1.0".into(),
        });
        ShellState::new(header, spawn, Arc::new(Quiet), ports)
    }

    /// Ports whose folders all exist and whose planners start this harness's processes.
    pub fn ports(&self) -> Ports {
        Ports {
            checks: Arc::new(Machine::default()),
            planner_for: Arc::new(Planners(Arc::clone(&self.planner) as _)),
        }
    }

    /// A launch whose companion hands the test the slot's runtime.
    pub fn launch(&self, title: &str) -> (SlotLaunch, async_channel::Receiver<SessionRuntime>) {
        let (sender, receiver) = async_channel::bounded(1);
        let launch = SlotLaunch {
            title: title.to_owned(),
            planner: Arc::clone(&self.planner) as _,
            working_directory: None,
            companion: Some(Box::new(move |runtime| {
                Box::pin(async move {
                    _ = sender.send(runtime).await;
                })
            })),
            relaunch: None,
        };
        (launch, receiver)
    }

    pub fn stubborn(&self) {
        self.answers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .stubborn = true;
    }

    pub fn refuse(&self, error: LaunchError) {
        self.answers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .refusals
            .push_back(error);
    }

    /// The control of session process `n` (0 is the first handed out), once it is there.
    pub async fn control(&self, n: usize) -> LiveControl {
        let answers = Arc::clone(&self.answers);
        until(move || {
            answers
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .controls
                .len()
                > n
        })
        .await;
        self.answers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .controls[n]
            .clone()
    }
}

pub fn drive<F: Future<Output = ()>>(test: impl FnOnce(Harness) -> F) {
    let executor = Arc::new(Executor::new());
    let body = test(Harness::new(Arc::clone(&executor)));
    smol::block_on(executor.run(future::race(body, async {
        Timer::after(TIMEOUT).await;
        panic!("the test did not end within {TIMEOUT:?}")
    })));
}

pub async fn until(cond: impl Fn() -> bool) {
    let deadline = Instant::now() + GUARD;
    while !cond() {
        assert!(Instant::now() < deadline, "the condition did not hold");
        Timer::after(Duration::from_millis(10)).await;
    }
}

pub async fn running(runtime: &SessionRuntime) {
    until(|| matches!(runtime.status(), SessionStatus::Running { .. })).await;
}

/// What the dialog's checks answer: the distributions installed, whether `claude.exe` is on
/// `PATH`, and which folders exist.
pub struct Machine {
    pub distros: Vec<String>,
    pub claude: ClaudeOnPath,
    pub folders: Option<Vec<String>>,
}

impl Default for Machine {
    fn default() -> Machine {
        Machine {
            distros: vec!["Ubuntu-26.04".to_owned()],
            claude: ClaudeOnPath::Found,
            folders: None,
        }
    }
}

impl LaunchChecks for Machine {
    fn installed_distros(&self) -> Vec<String> {
        self.distros.clone()
    }

    fn claude_on_path(&self) -> ClaudeOnPath {
        self.claude
    }

    fn default_distro(&self) -> Option<String> {
        self.distros.first().cloned()
    }

    fn folder_exists(&self, folder: &str) -> future::Boxed<bool> {
        let exists = self
            .folders
            .as_ref()
            .is_none_or(|folders| folders.iter().any(|it| it == folder));
        Box::pin(async move { exists })
    }
}

/// Every folder starts the harness's planner.
pub struct Planners(pub Arc<dyn SessionLaunchPlanner>);

impl PlannerFor for Planners {
    fn planner(&self, _folder: &str) -> Arc<dyn SessionLaunchPlanner> {
        Arc::clone(&self.0)
    }
}
