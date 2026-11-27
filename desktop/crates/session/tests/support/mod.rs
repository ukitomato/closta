#![allow(dead_code, clippy::expect_used, clippy::unwrap_used)]
//! What the session crate's tests share: a log that keeps its lines, a session that takes
//! nothing, a clock that stands still, and the processes, runtime and executor the runtime's
//! tests drive.

use std::collections::VecDeque;
use std::future::Future;
use std::rc::Rc;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use async_channel::Receiver;
use closta_core::ports::{AgentSession, Clock, SendError};
use closta_model::{ApprovalDecision, Attachment};
use closta_providers::claude::fake::live::{LiveControl, LiveOptions, LiveProcess};
use closta_providers::claude::fake::process::{FakeProcess, FakeProcessProbe, ProcessScript};
use closta_providers::claude::fake::spawner::FakeSpawner;
use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{AgentProcess, ProcessSpawner};
use closta_session::launch::NativeSessionLaunchPlanner;
use closta_session::log::SessionLog;
use closta_session::runtime::{SessionConfig, SessionRun, SessionRuntime};
use closta_session::status::SessionStatus;
use futures_lite::future;
use smol::{LocalExecutor, Timer};

/// A [`SessionLog`] that keeps every line, as `"INFO …"` or `"WARN …"`.
#[derive(Default)]
pub struct RecordingLog {
    lines: Mutex<Vec<String>>,
}

impl RecordingLog {
    /// The lines written so far, in order.
    pub fn lines(&self) -> Vec<String> {
        self.lines
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn push(&self, level: &str, line: &str) {
        self.lines
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(format!("{level} {line}"));
    }
}

impl SessionLog for RecordingLog {
    fn info(&self, line: &str) {
        self.push("INFO", line);
    }

    fn warn(&self, line: &str) {
        self.push("WARN", line);
    }
}

/// An [`AgentSession`] that is already closed: every send is `Err(Closed)`.
pub struct Failing;

impl AgentSession for Failing {
    fn send_user_message(
        &self,
        _text: &str,
        _attachments: &[Attachment],
        _uuid: Option<&str>,
    ) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn respond_to_approval(
        &self,
        _decision: &ApprovalDecision,
        _payload: Option<&str>,
        _updated_permissions: Option<&str>,
    ) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn set_model(&self, _model: &str, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn set_permission_mode(&self, _mode: &str, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn request_context_usage(&self, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn request_settings(&self, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn set_effort(&self, _effort: Option<&str>, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn turn_sandbox_off(&self, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn request_mcp_status(&self, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn set_mcp_server_enabled(
        &self,
        _name: &str,
        _enabled: bool,
        _request_id: &str,
    ) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn reconnect_mcp_server(&self, _name: &str, _request_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn rewind_files(
        &self,
        _user_message_id: &str,
        _dry_run: bool,
        _request_id: &str,
    ) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn interrupt(&self) -> Result<(), SendError> {
        Err(SendError::Closed)
    }

    fn stop_task(&self, _task_id: &str) -> Result<(), SendError> {
        Err(SendError::Closed)
    }
}

struct FixedClock(SystemTime);

impl Clock for FixedClock {
    fn now(&self) -> SystemTime {
        self.0
    }
}

/// A clock that always says `ms` milliseconds after the epoch.
pub fn fixed_clock(ms: u64) -> Arc<dyn Clock> {
    Arc::new(FixedClock(UNIX_EPOCH + Duration::from_millis(ms)))
}

/// The version every fake `claude --version` prints.
pub const VERSION: &str = "2.1.325";
/// How long a test waits for one thing to happen before it fails.
pub const GUARD: Duration = Duration::from_secs(10);
/// How long a whole test may take.
pub const TIMEOUT: Duration = Duration::from_secs(30);
/// The id of the session [`runtime`] makes.
pub const ID: &str = "session-1";
/// The working folder [`runtime`] gives; it holds a user's name, which no log line may show.
pub const WORKING_DIR: &str = "/work/someone";

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[derive(Default)]
struct Answers {
    sessions: VecDeque<Result<(LiveProcess, LiveControl), LaunchError>>,
    version: Option<ProcessScript>,
    version_probes: Vec<FakeProcessProbe>,
    controls: Vec<LiveControl>,
    // The session spawns asked for so far, refused ones included.
    spawns: usize,
    failures: Vec<(usize, LaunchError)>,
    previous_ended: Vec<bool>,
}

/// A spawner over the in-memory processes: `--version` gets a scripted process that prints
/// the version line, and every other launch the next prepared [`LiveProcess`] (a default one
/// once none is left) or the next prepared refusal.
pub struct Processes {
    answers: Arc<Mutex<Answers>>,
    spawner: Arc<FakeSpawner>,
}

impl Processes {
    /// Processes started on this machine.
    pub fn new() -> Processes {
        Processes::build(None)
    }

    /// Processes started in the WSL distribution `distro`.
    pub fn wsl(distro: &str) -> Processes {
        Processes::build(Some(distro))
    }

    fn build(distro: Option<&str>) -> Processes {
        let answers = Arc::new(Mutex::new(Answers::default()));
        let held = Arc::clone(&answers);
        let spawner = FakeSpawner::answering(move |launch: &Launch| {
            let mut answers = locked(&held);
            if launch.args == ["--version"] {
                let script = answers.version.clone().unwrap_or_else(|| {
                    ProcessScript::replaying(vec![format!("{VERSION} (Claude Code)")])
                });
                let (process, probe) = FakeProcess::new(script);
                answers.version_probes.push(probe);
                return Ok(Box::new(process) as Box<dyn AgentProcess>);
            }
            let index = answers.spawns;
            answers.spawns += 1;
            let previous_ended = answers.controls.last().map(LiveControl::ended);
            answers.previous_ended.extend(previous_ended);
            if let Some(at) = answers.failures.iter().position(|(n, _)| *n == index) {
                return Err(answers.failures.remove(at).1);
            }
            let (process, control) = answers
                .sessions
                .pop_front()
                .unwrap_or_else(|| Ok(LiveProcess::new(LiveOptions::default())))?;
            answers.controls.push(control);
            Ok(Box::new(process) as Box<dyn AgentProcess>)
        });
        let spawner = match distro {
            Some(distro) => spawner.with_wsl_distro(distro),
            None => spawner,
        };
        Processes {
            answers,
            spawner: Arc::new(spawner),
        }
    }

    /// The next session launch gets a process with `options`; its control is returned.
    pub fn prepare(&self, options: LiveOptions) -> LiveControl {
        let (process, control) = LiveProcess::new(options);
        locked(&self.answers)
            .sessions
            .push_back(Ok((process, control.clone())));
        control
    }

    /// The next session launch is refused with `error`.
    pub fn refuse(&self, error: LaunchError) {
        locked(&self.answers).sessions.push_back(Err(error));
    }

    /// The session spawn with index `n` (0 is the first) is refused with `error`, whatever was
    /// prepared; the prepared processes go to the spawns after it.
    pub fn fail_spawn(&self, n: usize, error: LaunchError) {
        locked(&self.answers).failures.push((n, error));
    }

    /// For each session spawn after the first, whether the process handed out before it had
    /// ended when it was asked for.
    pub fn previous_ended_at_spawn(&self) -> Vec<bool> {
        locked(&self.answers).previous_ended.clone()
    }

    /// Every `--version` from now on is played from `script`.
    pub fn version_answers(&self, script: ProcessScript) {
        locked(&self.answers).version = Some(script);
    }

    pub fn spawner(&self) -> Arc<dyn ProcessSpawner> {
        Arc::clone(&self.spawner) as Arc<dyn ProcessSpawner>
    }

    /// Every launch asked for, `--version` included, in order.
    pub fn launches(&self) -> Vec<Launch> {
        self.spawner.launches()
    }

    /// The args of every launch but `--version`, in order.
    pub fn session_args(&self) -> Vec<Vec<String>> {
        self.launches()
            .into_iter()
            .map(|launch| launch.args)
            .filter(|args| args != &["--version"])
            .collect()
    }

    /// What each `--version` process handed out was written on stdin, in order.
    pub fn version_stdin(&self) -> Vec<Vec<String>> {
        locked(&self.answers)
            .version_probes
            .iter()
            .map(FakeProcessProbe::stdin_lines)
            .collect()
    }

    /// The controls of the session processes handed out, in order.
    pub fn controls(&self) -> Vec<LiveControl> {
        locked(&self.answers).controls.clone()
    }
}

/// Capture 03, whose first line is the CLI's answer to the recorder's initialize.
const HANDSHAKE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../jetbrains/src/main/kotlin/dev/ukitomato/closta/providers/claude/fixtures/",
    "03-initialize-handshake.ndjson"
));

fn handshake_answer() -> serde_json::Value {
    let first = HANDSHAKE
        .lines()
        .next()
        .expect("capture 03 has a first line");
    serde_json::from_str(first).expect("capture 03's first line is json")
}

/// Capture 03's answer to the initialize as the answer to `id`; with no model list when
/// `models` is false.
pub fn initialize_answer(id: &str, models: bool) -> String {
    let mut answer = handshake_answer();
    answer["response"]["request_id"] = id.into();
    if !models {
        answer["response"]["response"]
            .as_object_mut()
            .expect("the answer has a body")
            .remove("models");
    }
    answer.to_string()
}

/// How many commands capture 03's answer to the initialize lists.
pub fn handshake_commands() -> usize {
    handshake_answer()["response"]["response"]["commands"]
        .as_array()
        .expect("the answer lists the commands")
        .len()
}

/// The CLI refusing the initialize `id`.
pub fn refused_initialize(id: &str) -> String {
    serde_json::json!({
        "type": "control_response",
        "response": { "subtype": "error", "request_id": id, "error": "refused" }
    })
    .to_string()
}

/// A runtime of session [`ID`] in [`WORKING_DIR`], planned natively over `processes` with no
/// env, its version check bounded by [`GUARD`], changed by `configure` before it is made.
pub fn runtime(
    processes: &Processes,
    configure: impl FnOnce(&mut SessionConfig),
) -> (SessionRuntime, SessionRun, Arc<RecordingLog>) {
    runtime_over(processes.spawner(), configure)
}

/// [`runtime`] over any spawner, for a test that answers the launches itself.
pub fn runtime_over(
    spawner: Arc<dyn ProcessSpawner>,
    configure: impl FnOnce(&mut SessionConfig),
) -> (SessionRuntime, SessionRun, Arc<RecordingLog>) {
    let log = Arc::new(RecordingLog::default());
    let planner = Arc::new(NativeSessionLaunchPlanner::new(
        spawner,
        Arc::new(SecretEnv::default),
    ));
    let mut config = SessionConfig::new(
        ID,
        planner,
        Some(WORKING_DIR.to_owned()),
        Arc::clone(&log) as Arc<dyn SessionLog>,
    );
    config.version_timeout = GUARD;
    configure(&mut config);
    let (runtime, run) = SessionRuntime::new(config);
    (runtime, run, log)
}

/// Runs `test` on a local executor it is given (to spawn the session's run on), failing the
/// test once [`TIMEOUT`] has passed.
pub fn drive<T, F: Future<Output = T>>(test: impl FnOnce(Rc<LocalExecutor<'static>>) -> F) -> T {
    let executor = Rc::new(LocalExecutor::new());
    let body = test(Rc::clone(&executor));
    smol::block_on(executor.run(future::or(body, async {
        Timer::after(TIMEOUT).await;
        panic!("the test did not end within {TIMEOUT:?}")
    })))
}

/// Every status `rx` was sent, read once the run has ended: the channel of
/// [`SessionRuntime::watch_status`] closes at the end, and what it held is read here.
pub fn statuses(rx: &Receiver<SessionStatus>) -> Vec<SessionStatus> {
    std::iter::from_fn(|| rx.try_recv().ok()).collect()
}

/// Waits until `cond` holds, looking every 10 ms, and fails after [`GUARD`].
pub async fn until(cond: impl Fn() -> bool) {
    let deadline = Instant::now() + GUARD;
    while !cond() {
        assert!(
            Instant::now() < deadline,
            "the condition did not hold within {GUARD:?}"
        );
        Timer::after(Duration::from_millis(10)).await;
    }
}

/// The first status of `runtime` (the current one included) that `pred` accepts, failing after
/// [`GUARD`].
pub async fn reach(
    runtime: &SessionRuntime,
    pred: impl Fn(&SessionStatus) -> bool,
) -> SessionStatus {
    let rx = runtime.watch_status();
    let waiting = async {
        loop {
            let status = rx.recv().await.expect("the status channel stays open");
            if pred(&status) {
                return status;
            }
        }
    };
    future::or(waiting, async {
        Timer::after(GUARD).await;
        panic!(
            "no status the test waits for came within {GUARD:?}; the last is {:?}",
            runtime.status()
        )
    })
    .await
}
