//! One session's life: plan the launch, check `claude --version`, start the long-lived process,
//! fold what it says, and notice how it ends; a restart into the sandbox, and the one start
//! without it when the sandboxed CLI does not start. SessionRuntime.kt.
//!
//! [`SessionRuntime::new`] hands out the handle (status, view, commands, close) and the
//! [`SessionRun`], one future the platform runs in the background. Inside it the
//! [`ClaudeSession`] pump and the fold run together with no task and no thread of their own;
//! only the synchronous spawns and the read of a saved record go to the blocking pool.

use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use async_channel::{Receiver, Sender};
use closta_core::ports::SavedSessions;
use closta_model::AgentEvent;
use closta_presenter::input::{Launched, PresenterInput};
use closta_presenter::records::operations::asks_for_settings;
use closta_presenter::session::{SessionView, afresh_after_clear, resume_id_of};
use closta_providers::claude::launch::spec::LaunchSpec;
use closta_providers::claude::launch::version::{VERSION_TIMEOUT, check_version_within};
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{AgentProcess, ProcessSpawner};
use closta_providers::claude::session::{ClaudeSession, PumpEnd, StartedSession};
use futures_lite::future;

use crate::clock::SystemClock;
use crate::commands::SessionCommands;
use crate::history::SessionOpening;
use crate::launch::{SessionLaunch, SessionLaunchPlanner};
use crate::live::{LiveProcesses, Tracked};
use crate::log::SessionLog;
use crate::sandbox::{RestartFrom, SandboxStartWatch, carried_choices, restart_spec};
use crate::status::{SessionFailure, SessionStatus};
use crate::store::ConversationStore;

mod close;
mod restart;
mod restore;

use restore::restore_history;

/// How long a close waits for the process to end before it kills it.
pub const CLOSE_WAIT: Duration = Duration::from_secs(5);
/// How long a close waits for a killed process to end before it gives up.
pub const KILL_WAIT: Duration = Duration::from_secs(2);

/// The life of one session, for the platform to run in the background. It returns once the
/// session has ended, failed or been closed. Dropping it kills the children but leaves the status
/// as it was; the platform detaches it (stage 6).
pub type SessionRun = future::Boxed<()>;

/// What one session is started with.
pub struct SessionConfig {
    pub id: String,
    pub planner: Arc<dyn SessionLaunchPlanner>,
    /// The folder the CLI runs in; `None` is the project's root.
    pub working_directory: Option<String>,
    pub log: Arc<dyn SessionLog>,
    /// The effort the process is started with, or `None` for the CLI's own.
    pub effort: Option<String>,
    /// The permission mode new sessions start in, read once when this session starts; `None`
    /// leaves it to the CLI. Read each time, so a change in the settings applies from the next
    /// session.
    pub start_mode: Arc<dyn Fn() -> Option<String> + Send + Sync>,
    /// Whether the CLI is launched in the sandbox (`--settings`).
    pub sandbox: bool,
    pub version_timeout: Duration,
    pub close_wait: Duration,
    pub kill_wait: Duration,
    /// A new conversation, or the saved session of `id` put back.
    pub opening: SessionOpening,
    /// Where a resumed session reads its earlier conversation from.
    pub saved: Option<Arc<dyn SavedSessions>>,
}

impl SessionConfig {
    /// A session with no effort, no mode, no sandbox and the default waits.
    pub fn new(
        id: &str,
        planner: Arc<dyn SessionLaunchPlanner>,
        working_directory: Option<String>,
        log: Arc<dyn SessionLog>,
    ) -> SessionConfig {
        SessionConfig {
            id: id.to_owned(),
            planner,
            working_directory,
            log,
            effort: None,
            start_mode: Arc::new(|| None),
            sandbox: false,
            version_timeout: VERSION_TIMEOUT,
            close_wait: CLOSE_WAIT,
            kill_wait: KILL_WAIT,
            opening: SessionOpening::New,
            saved: None,
        }
    }
}

// Written by hand: the working folder's path holds the user's name.
impl fmt::Debug for SessionConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SessionConfig")
            .field("id", &self.id)
            .field("effort", &self.effort)
            .field("sandbox", &self.sandbox)
            .field("version_timeout", &self.version_timeout)
            .field("close_wait", &self.close_wait)
            .field("kill_wait", &self.kill_wait)
            .field("opening", &self.opening)
            .field("saved", &self.saved.is_some())
            .finish_non_exhaustive()
    }
}

/// The status, the commands that go with it, and the restart into the sandbox that is marked:
/// changed together, under one lock.
struct State {
    status: SessionStatus,
    commands: Option<Arc<SessionCommands>>,
    watchers: Vec<Sender<SessionStatus>>,
    /// The sandbox switch a restart is marked for, until the run takes it (Kotlin's
    /// `restartFor`).
    restart_for: Option<String>,
}

impl State {
    /// Writes `status` and `commands` unless the session was closed, or ended or failed and
    /// `status` would start it again, and tells every watcher of a change. Returns whether it
    /// was written.
    fn set(&mut self, status: SessionStatus, commands: Option<Arc<SessionCommands>>) -> bool {
        // Closed is the last status: nothing overwrites it. A session that ended or failed does
        // not run again: a start that finished late must not show it as alive.
        let back = matches!(
            (&self.status, &status),
            (
                SessionStatus::Ended | SessionStatus::Failed(_),
                SessionStatus::Starting | SessionStatus::Running { .. }
            )
        );
        if self.status == SessionStatus::Closed || back {
            return false;
        }
        // The same status with no commands either way is no change (a restart's Starting).
        let same = self.status == status && self.commands.is_none() && commands.is_none();
        self.status = status;
        self.commands = commands;
        if !same {
            let status = &self.status;
            self.watchers
                .retain(|watcher| watcher.try_send(status.clone()).is_ok());
            // Nothing follows an end: dropping the senders closes the channels once they are
            // read to the end.
            if status.is_end() {
                self.watchers.clear();
            }
        }
        true
    }
}

/// What the handles and the run share. The lock order is the store, then the state: nothing
/// touches the store under the state's lock.
struct Shared {
    id: String,
    store: Arc<ConversationStore>,
    state: Mutex<State>,
    live: LiveProcesses,
    // Held here, so that dropping every handle does not close the session; only `close` does.
    closing: Sender<()>,
    // A wake-up for the run once a restart is marked; sent and drained under the state's lock.
    restarting: Sender<()>,
    // Turned true by a close, for a read of the saved record still under way on the blocking
    // pool: the run does not wait for it, so it is told to stop.
    stop_reading: Arc<AtomicBool>,
}

impl Shared {
    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// The handle of one session. Cloned handles are the same session.
#[derive(Clone)]
pub struct SessionRuntime {
    shared: Arc<Shared>,
}

impl SessionRuntime {
    /// The session's handle, and its life to run. Nothing starts until the run is polled.
    pub fn new(config: SessionConfig) -> (SessionRuntime, SessionRun) {
        let (closing, closed) = async_channel::bounded(1);
        let (restarting, marked) = async_channel::bounded(1);
        let shared = Arc::new(Shared {
            id: config.id.clone(),
            store: Arc::new(ConversationStore::default()),
            state: Mutex::new(State {
                status: SessionStatus::Starting,
                commands: None,
                watchers: Vec::new(),
                restart_for: None,
            }),
            live: LiveProcesses::default(),
            closing,
            restarting,
            stop_reading: Arc::new(AtomicBool::new(false)),
        });
        let run = Box::pin(run(Arc::clone(&shared), config, Signals { closed, marked }));
        (SessionRuntime { shared }, run)
    }

    pub fn id(&self) -> &str {
        &self.shared.id
    }

    /// The id the conversation is saved under now: the CLI's after a `/clear` once its next init
    /// named it, [`SessionRuntime::id`] otherwise.
    pub fn resume_id(&self) -> String {
        self.shared
            .store
            .read(|view| resume_id_of(view, &self.shared.id))
    }

    /// Whether a restart starts a new conversation under [`SessionRuntime::resume_id`] rather
    /// than resuming one: the conversation was cleared, the CLI's init named its new id, and
    /// nothing was sent since ([`afresh_after_clear`]).
    pub fn restarts_afresh(&self) -> bool {
        self.shared
            .store
            .read(|view| afresh_after_clear(view).is_some())
    }

    /// Where the session is now.
    pub fn status(&self) -> SessionStatus {
        self.shared.state().status.clone()
    }

    /// Every status from now on, the current one first. The channel is unbounded and closes
    /// once the session ends (Ended, Failed or Closed is the last status it carries); taken
    /// after the end it holds the end alone and is closed. A receiver that is dropped is let go
    /// at the next status.
    pub fn watch_status(&self) -> Receiver<SessionStatus> {
        let (sender, receiver) = async_channel::unbounded();
        let mut state = self.shared.state();
        _ = sender.try_send(state.status.clone());
        if !state.status.is_end() {
            state.watchers.push(sender);
        }
        receiver
    }

    /// The conversation and its transcript.
    pub fn view(&self) -> SessionView {
        self.shared.store.view()
    }

    /// Whether the session has sent the CLI a request of the user's: what a restart continues.
    pub fn sent(&self) -> bool {
        sent_of(&self.view())
    }

    /// A ping after each change of the view; it holds at most one. It closes once the session
    /// ends, and is closed already when taken after the end.
    pub fn watch_view(&self) -> Receiver<()> {
        self.shared.store.watch()
    }

    /// The commands of the running session; `None` while it is not running.
    pub fn commands(&self) -> Option<Arc<SessionCommands>> {
        self.shared.state().commands.clone()
    }

    /// Closes the session: the status is Closed for good and the commands are revoked at once.
    /// The run then tells the process to end, waits for it, kills it if it does not end, and
    /// returns. Closing again, or after the session ended or failed, only says Closed.
    pub fn close(&self) {
        {
            let mut state = self.shared.state();
            if let Some(commands) = state.commands.take() {
                commands.revoke();
            }
            state.set(SessionStatus::Closed, None);
        }
        // Off the state's lock: the store comes before the state in the lock order.
        self.shared.store.close_watchers();
        self.shared.closing.close();
        // Only once the close is sent, so a read that ends as stopped finds the run closed.
        self.shared.stop_reading.store(true, Ordering::SeqCst);
    }

    /// Turns the sandbox on: the CLI is started again with `--settings` under the same runtime,
    /// so the conversation stays (a live `apply_flag_settings` was seen to say yes while Bash
    /// still ran outside the sandbox: capture 36). Nothing happens when the session is not
    /// running or a switch of the sandbox already waits; a turn or a background task that runs
    /// refuses it, on the record. Returns whether a restart was marked: the switch is then
    /// pending until the new CLI's settings say whether the sandbox is on.
    ///
    /// From the mark on the session is Starting and its commands are revoked, so nothing more
    /// is written to the CLI that is being stopped. Commands revoked while the status still says
    /// Running mean the process has ended: the run revokes them before it reads the mark, under
    /// the same lock, so a mark is either read or refused, never left pending on an ended session.
    pub fn turn_sandbox_on(&self) -> bool {
        restart::turn_sandbox_on(&self.shared)
    }

    /// Kills the session's processes now, on the calling thread, and every process it starts
    /// from now on; the status is left as it is. For the platform's last step when the app ends
    /// and cannot wait for the run (`destroy_forcibly`, where Kotlin's `destroyNow` destroyed).
    pub fn destroy_now(&self) {
        self.shared.live.destroy_all();
    }
}

/// What the run is told from the handles: the close, and the wake-up of a restart.
struct Signals {
    closed: Receiver<()>,
    marked: Receiver<()>,
}

async fn run(shared: Arc<Shared>, config: SessionConfig, signals: Signals) {
    let outcome = life(&shared, &config, &signals).await;
    // A spawn still under way when the run returns finds the list closed, and is killed.
    shared.live.destroy_all();
    // A switch into the sandbox the session ended before (a close during a restart, a CLI that
    // failed) is over with it, however the session ended.
    restart::fail_pending_sandbox(&shared);
    let Some(outcome) = outcome else {
        return;
    };
    let id = &config.id;
    let written = {
        let mut state = shared.state();
        if let Some(commands) = state.commands.take() {
            commands.revoke();
        }
        state.set(outcome.clone(), None)
    };
    shared.store.close_watchers();
    if !written {
        return;
    }
    match outcome {
        // The kind only: a failure can carry the working folder's path.
        SessionStatus::Failed(failure) => config
            .log
            .warn(&format!("claude session {id}: failed ({})", failure.kind())),
        _ => config.log.info(&format!("claude session {id}: ended")),
    }
}

/// The session from its plan to its end, as the status it ends in; `None` once it was closed.
///
/// A close during the plan or the version check drops them (the check's process is killed as it
/// drops) and starts nothing. A close during a spawn waits for the spawn, and then closes the
/// process it made; a session that ended or failed first waits for nothing. The processes run
/// one after another (Kotlin's `runProcesses`): the launch's, then a restart into the sandbox,
/// or the one start without it that follows a CLI that could not sandbox. The plan and the
/// version check are done once, for all of them.
async fn life(
    shared: &Arc<Shared>,
    config: &SessionConfig,
    signals: &Signals,
) -> Option<SessionStatus> {
    let closed = &signals.closed;
    // The close side first: a session closed before its run is polled plans nothing.
    let prepared = future::or(
        async {
            _ = closed.recv().await;
            None
        },
        async { Some(prepare(shared, config).await) },
    )
    .await?;
    let Prepared {
        spawner,
        spec: first,
        version,
    } = match prepared {
        Ok(prepared) => prepared,
        Err(status) => return Some(status),
    };

    let mut start = Start {
        spec: first.clone(),
        switch: None,
        relaunch: false,
    };
    loop {
        let (spec, switch) =
            match run_process(shared, config, signals, &spawner, &start, &version).await {
                ProcessEnd::Over(outcome) => return outcome,
                ProcessEnd::NotStarted => (
                    LaunchSpec {
                        sandbox: false,
                        ..start.spec
                    },
                    None,
                ),
                ProcessEnd::Restart(switch) => {
                    let view = shared.store.view();
                    let resume_id = resume_id_of(&view, &shared.id);
                    let from = match afresh_after_clear(&view) {
                        Some(id) => RestartFrom::ClearedTo(id),
                        None if sent_of(&view) => RestartFrom::SentUnder(&resume_id),
                        None => RestartFrom::Unsent,
                    };
                    let spec =
                        restart_spec(&first, from, config.opening, &carried_choices(&view), true);
                    (spec, Some(switch))
                }
            };
        // A close that landed while the old process was waited for is not overwritten by a
        // start, and nothing more is started (Kotlin's `ensureActive`).
        if closed.is_closed() || !shared.state().set(SessionStatus::Starting, None) {
            return None;
        }
        start = Start {
            spec,
            switch,
            relaunch: true,
        };
    }
}

/// One process to start: its spec, the sandbox switch it serves (if it is one), and whether
/// an earlier process of the session ran before it.
struct Start {
    spec: LaunchSpec,
    switch: Option<String>,
    relaunch: bool,
}

/// How one process's part of the session ended.
enum ProcessEnd {
    /// The session is over, in this status; `None` once it was closed.
    Over(Option<SessionStatus>),
    /// The CLI asked into the sandbox did not start: the next starts without it.
    NotStarted,
    /// A restart into the sandbox was marked for this switch, and the old process has ended.
    Restart(String),
}

/// What ended one process's folding.
enum Settled {
    Closed,
    Marked(String),
    Ended(PumpEnd),
}

/// Starts one process and folds what it says until it ends, the session is closed, or a
/// restart is marked (Kotlin's `runProcess` and `settled`). On a restart the folding stops (what
/// the old CLI still says is let go) and the next process is started only after the old one has
/// ended, by the close order, so two CLIs never write the same record.
async fn run_process(
    shared: &Arc<Shared>,
    config: &SessionConfig,
    signals: &Signals,
    spawner: &Arc<dyn ProcessSpawner>,
    start: &Start,
    version: &str,
) -> ProcessEnd {
    let id = &config.id;
    let closed = &signals.closed;
    let spec = &start.spec;
    // A switch into the sandbox whose CLI could not be made is over: the session fails, and the
    // switch with it.
    let fail_switch = || {
        if let Some(switch) = &start.switch {
            restart::not_started(shared, switch.clone(), None);
        }
    };
    let Ok(launch) = Launch::of(spec) else {
        fail_switch();
        return ProcessEnd::Over(Some(SessionStatus::Failed(SessionFailure::PlanFailed)));
    };
    // Not raced with the close: what the spawn makes is closed like any other process.
    let process = match spawn(shared, Arc::clone(spawner), launch.clone()).await {
        Ok(process) => process,
        Err(error) => {
            fail_switch();
            let failure = SessionFailure::from_launch(&error);
            return ProcessEnd::Over(Some(failed(&**spawner, failure)));
        }
    };
    let handle = process.handle();
    let StartedSession {
        session,
        events,
        pump,
    } = ClaudeSession::start(Box::new(process), id);
    // First in the queue, so it is the first line this CLI reads, whatever is sent later.
    let init_id = match session.queue_initialize() {
        Ok(init_id) => Some(init_id),
        // The kind only, as for every request; the session goes on, its output says its end.
        Err(error) => {
            config.log.warn(&format!(
                "claude session {id}: initialize could not be queued ({error:?})"
            ));
            None
        }
    };
    let close = |pump| {
        close::close_pumping(
            handle,
            pump,
            &events,
            config.close_wait,
            config.kill_wait,
            id,
            &*config.log,
        )
    };
    if closed.is_closed() {
        close(pump).await;
        return ProcessEnd::Over(None);
    }
    config
        .log
        .info(&format!("claude session {id}: started {:?}", launch.args));

    // The view says the effort from its first snapshot on, before the session runs; a first
    // process with no effort says nothing, unless it is in the sandbox. Every start after the
    // first says what it was started with, the sandbox included.
    let sandboxed = spec.sandbox;
    if start.relaunch || config.effort.is_some() || sandboxed {
        let effort = if start.relaunch {
            spec.effort.clone()
        } else {
            config.effort.clone()
        };
        let launched = PresenterInput::Launched(Launched {
            effort,
            built_in_mcp_servers: Vec::new(),
            sandbox: sandboxed,
        });
        shared.store.transition(|view| view.fold(&launched));
    }
    // After the first process is up (a start that fails puts nothing back) and before the session
    // runs, so nothing the user sends can come before the earlier conversation. Once: a restart
    // keeps the view, and with it what was put back.
    if !start.relaunch && !restore_history(shared, config, closed).await {
        close(pump).await;
        return ProcessEnd::Over(None);
    }
    let commands = Arc::new(SessionCommands::new(
        Arc::new(session),
        Arc::new(SystemClock),
        Arc::clone(&shared.store),
    ));
    let running = SessionStatus::Running {
        version: version.to_owned(),
    };
    if !shared.state().set(running, Some(Arc::clone(&commands))) {
        // Closed meanwhile: the close below wins at once, and nothing is asked.
        commands.revoke();
    }

    let mut pump = pump;
    let mut watch = SandboxStartWatch::new(sandboxed);
    let init = OwnInit {
        id: init_id.as_deref(),
        sandboxed,
    };
    let folding = async {
        let mut asked = false;
        while let Ok(event) = events.recv().await {
            for event in watch.pass(event) {
                asked |= fold_event(shared, &commands, config, event, init, asked);
            }
        }
    };
    // The close side first, then the mark: once either is seen, nothing more is folded.
    let settled = future::or(
        async {
            _ = closed.recv().await;
            Settled::Closed
        },
        future::or(
            async { Settled::Marked(restart::marked(shared, &signals.marked).await) },
            async {
                let (end, ()) = future::zip(&mut pump, folding).await;
                Settled::Ended(end)
            },
        ),
    )
    .await;
    commands.revoke();
    let end = match settled {
        Settled::Closed => {
            close(pump).await;
            return ProcessEnd::Over(None);
        }
        Settled::Marked(switch) => {
            close(pump).await;
            return ProcessEnd::Restart(switch);
        }
        Settled::Ended(end) => end,
    };
    // A CLI asked into the sandbox that ended having said nothing but a `result` did not start,
    // whatever its exit: that is no failure of the session, and its result is not folded.
    let started = watch.started();
    if !started {
        let switch = start.switch.clone().unwrap_or_else(new_id);
        restart::not_started(shared, switch, watch.detail());
    }
    // A CLI that started and failed fails the session, a restart marked meanwhile or not (as in
    // Kotlin's runProcess); the run then fails the marked switch.
    if started && let PumpEnd::Failed(failure) = end {
        return ProcessEnd::Over(Some(failed(&**spawner, SessionFailure::from_exit(failure))));
    }
    // A restart marked while the process was ending is a restart all the same.
    if let Some(switch) = restart::take_mark(shared, &signals.marked) {
        close(pump).await;
        return ProcessEnd::Restart(switch);
    }
    if !started {
        close(pump).await;
        return ProcessEnd::NotStarted;
    }
    // A failure returned above; the run holds the receiver of the events, so the pump is never
    // abandoned.
    ProcessEnd::Over(Some(SessionStatus::Ended))
}

/// Whether `view` holds a request the user sent.
fn sent_of(view: &SessionView) -> bool {
    view.transcript.routing.sends > 0
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// What the session is started with once the version is known.
struct Prepared {
    spawner: Arc<dyn ProcessSpawner>,
    /// The planned spec with the session's choices: the first process's, and what a restart
    /// starts from.
    spec: LaunchSpec,
    version: String,
}

/// The plan and the version check, or the status they failed with.
async fn prepare(shared: &Arc<Shared>, config: &SessionConfig) -> Result<Prepared, SessionStatus> {
    let id = &config.id;
    let mode = (config.start_mode)();
    let planned = config
        .planner
        .plan(id, config.working_directory.as_deref())
        .await
        .map_err(SessionStatus::Failed)?;
    let planned = with_choices(
        planned,
        config.effort.as_deref(),
        mode,
        config.sandbox,
        config.opening,
    );
    let spawner = planned.spawner;
    // A spec that contradicts itself is a plan that failed.
    let Ok(launch) = Launch::of(&planned.spec) else {
        return Err(SessionStatus::Failed(SessionFailure::PlanFailed));
    };

    let check = launch.version_check();
    let spawned = spawn(shared, Arc::clone(&spawner), check.clone());
    let version = check_version_within(
        async {
            spawned
                .await
                .map(|tracked| Box::new(tracked) as Box<dyn AgentProcess>)
        },
        config.version_timeout,
    )
    .await
    .map_err(|failure| failed(&*spawner, SessionFailure::from_version(failure)))?;
    config.log.info(&format!(
        "claude session {id}: {:?} -> {version}",
        check.args
    ));
    Ok(Prepared {
        spawner,
        spec: planned.spec,
        version,
    })
}

/// `failure` as the session's end, named for the WSL distribution `spawner` starts in.
fn failed(spawner: &dyn ProcessSpawner, failure: SessionFailure) -> SessionStatus {
    SessionStatus::Failed(failure.for_spawner(spawner.wsl_distro()))
}

/// Starts `launch` on the blocking pool and puts the process on the session's list in the same
/// step, so that a close never misses it.
fn spawn(
    shared: &Arc<Shared>,
    spawner: Arc<dyn ProcessSpawner>,
    launch: Launch,
) -> impl Future<Output = Result<Tracked, LaunchError>> + Send + 'static {
    let shared = Arc::clone(shared);
    blocking::unblock(move || {
        spawner
            .spawn(&launch)
            .map(|process| shared.live.track(process))
    })
}

/// The `initialize` this process was sent, and whether the process is in the sandbox.
#[derive(Clone, Copy)]
struct OwnInit<'a> {
    id: Option<&'a str>,
    sandboxed: bool,
}

/// Folds one event. The settings are asked for once at the first of: the first `system/init`,
/// the answer to our `initialize` when it lists the models, and, in the sandbox, that answer
/// refused or with no models (the settings alone say whether the sandbox is on). That answer
/// asks nothing once they were asked. Any other answer that calls for them asks again, read on
/// the records before the event is folded. Returns whether they were asked.
fn fold_event(
    shared: &Shared,
    commands: &SessionCommands,
    config: &SessionConfig,
    event: AgentEvent,
    init: OwnInit<'_>,
    asked: bool,
) -> bool {
    let own_answer = answers(&event, init.id);
    let first = !asked && ((own_answer && init.sandboxed) || is_system_init(&event));
    let asks = shared.store.transition_with(|view| {
        let calls_for =
            !(own_answer && asked) && asks_for_settings(&view.transcript.operations, &event);
        (view.fold(&PresenterInput::Event(event)), first || calls_for)
    });
    if asks {
        ask_settings(commands, config);
    }
    asks
}

/// Whether `event` is the CLI's answer to the request `id`.
fn answers(event: &AgentEvent, id: Option<&str>) -> bool {
    matches!(
        (event, id),
        (AgentEvent::ControlResponse { request_id: Some(answered), .. }, Some(id))
            if answered == id
    )
}

fn is_system_init(event: &AgentEvent) -> bool {
    matches!(event, AgentEvent::SystemInit { .. })
}

/// A settings request that could not be written is recorded as failed by the commands; it is no
/// reason to end the session, whose end its output says.
fn ask_settings(commands: &SessionCommands, config: &SessionConfig) {
    if let Err(error) = commands.request_settings() {
        config.log.warn(&format!(
            "claude session {}: the settings could not be asked for ({error:?})",
            config.id
        ));
    }
}

/// The plan with what is the user's choice for this session laid over it: the effort, the
/// permission mode, the sandbox, and a resume of the session's own id. With none of them (a new
/// session) the plan is used as it came, its sandbox included.
fn with_choices(
    planned: SessionLaunch,
    effort: Option<&str>,
    mode: Option<String>,
    sandbox: bool,
    opening: SessionOpening,
) -> SessionLaunch {
    if effort.is_none() && mode.is_none() && !sandbox && opening == SessionOpening::New {
        return planned;
    }
    let spec = planned.spec;
    let resume = match opening {
        SessionOpening::Resume => Some(spec.session_id.clone()),
        SessionOpening::New => spec.resume.clone(),
    };
    SessionLaunch {
        spawner: planned.spawner,
        spec: LaunchSpec {
            resume,
            effort: effort.map(str::to_owned).or(spec.effort),
            permission_mode: mode.or(spec.permission_mode),
            sandbox,
            ..spec
        },
    }
}

#[cfg(test)]
mod tests {
    use closta_model::SavedTranscript;
    use closta_providers::claude::fake::saved::FakeSavedSessions;
    use closta_providers::claude::fake::spawner::FakeSpawner;

    use super::*;

    fn planned(change: impl FnOnce(&mut LaunchSpec)) -> SessionLaunch {
        let mut spec = LaunchSpec::new("s");
        change(&mut spec);
        SessionLaunch {
            spawner: Arc::new(FakeSpawner::answering(|_| {
                Err(LaunchError::CommandNotFound)
            })),
            spec,
        }
    }

    #[test]
    fn with_no_choice_the_plan_is_used_as_it_came_its_sandbox_included() {
        let as_planned = with_choices(
            planned(|spec| spec.sandbox = true),
            None,
            None,
            false,
            SessionOpening::New,
        );
        assert!(as_planned.spec.sandbox);
    }

    #[test]
    fn choices_are_laid_over_the_plan_and_the_sandbox_is_the_sessions() {
        let chosen = with_choices(
            planned(|spec| {
                spec.effort = Some("low".into());
                spec.permission_mode = Some("plan".into());
                spec.sandbox = true;
            }),
            Some("high"),
            None,
            false,
            SessionOpening::New,
        );
        assert_eq!(chosen.spec.effort.as_deref(), Some("high"));
        assert_eq!(chosen.spec.permission_mode.as_deref(), Some("plan"));
        assert!(!chosen.spec.sandbox);

        let mode = with_choices(
            planned(|_| {}),
            None,
            Some("auto".into()),
            true,
            SessionOpening::New,
        );
        assert_eq!(mode.spec.effort, None);
        assert_eq!(mode.spec.permission_mode.as_deref(), Some("auto"));
        assert!(mode.spec.sandbox);
    }

    #[test]
    fn with_no_choice_a_resume_still_resumes() {
        let resumed = with_choices(planned(|_| {}), None, None, false, SessionOpening::Resume);
        assert_eq!(resumed.spec.resume.as_deref(), Some("s"));
    }

    #[test]
    fn a_status_that_ended_or_closed_is_never_started_again() {
        let running = || SessionStatus::Running {
            version: "2.1.282".into(),
        };
        let ends = [
            SessionStatus::Ended,
            SessionStatus::Failed(SessionFailure::PlanFailed),
            SessionStatus::Closed,
        ];
        for end in ends {
            let (watcher, watched) = async_channel::unbounded();
            let mut state = State {
                status: end.clone(),
                commands: None,
                watchers: vec![watcher],
                restart_for: None,
            };
            assert!(!state.set(SessionStatus::Starting, None), "{end:?}");
            assert!(!state.set(running(), None), "{end:?}");
            assert_eq!(state.status, end);
            assert!(watched.try_recv().is_err(), "nobody is told of {end:?}");
        }

        // Ended and Failed may still be closed; a repeated Starting tells nobody again.
        let (watcher, watched) = async_channel::unbounded();
        let mut state = State {
            status: SessionStatus::Starting,
            commands: None,
            watchers: vec![watcher],
            restart_for: None,
        };
        assert!(state.set(SessionStatus::Starting, None));
        assert!(watched.try_recv().is_err());
        assert!(state.set(SessionStatus::Ended, None));
        assert!(state.set(SessionStatus::Closed, None));
        assert_eq!(watched.try_recv(), Ok(SessionStatus::Ended));
        assert!(
            watched.is_closed(),
            "the end closes the channel; Closed follows unheard"
        );
    }

    #[test]
    fn config_debug_shows_no_folder() {
        struct Quiet;
        impl SessionLog for Quiet {
            fn info(&self, _: &str) {}
            fn warn(&self, _: &str) {}
        }
        struct Never;
        impl SessionLaunchPlanner for Never {
            fn plan(
                &self,
                _: &str,
                _: Option<&str>,
            ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
                Box::pin(future::pending())
            }
        }
        let config = SessionConfig::new(
            "s",
            Arc::new(Never),
            Some("/home/someone/project".into()),
            Arc::new(Quiet),
        );
        let shown = format!("{config:?}");
        assert!(!shown.contains("someone"), "{shown}");
        assert!(shown.contains("\"s\""), "{shown}");
        assert!(shown.contains("opening: New"), "{shown}");
        assert!(shown.contains("saved: false"), "{shown}");

        assert_eq!(config.close_wait, CLOSE_WAIT);
        assert_eq!(config.kill_wait, KILL_WAIT);
        assert_eq!(config.version_timeout, VERSION_TIMEOUT);
        assert_eq!(config.opening, SessionOpening::New);
        assert!(config.saved.is_none());

        let mut resumed = config;
        resumed.opening = SessionOpening::Resume;
        resumed.saved = Some(Arc::new(FakeSavedSessions::default().with_transcript(
            "s",
            SavedTranscript {
                events: Vec::new(),
                skipped: 4711,
                dropped: 0,
            },
        )));
        let shown = format!("{resumed:?}");
        assert!(shown.contains("opening: Resume"), "{shown}");
        assert!(shown.contains("saved: true"), "{shown}");
        assert!(
            !shown.contains("4711"),
            "the saved sessions are not shown: {shown}"
        );
        assert!(!shown.contains("someone"), "{shown}");
        assert_eq!((resumed.start_mode)(), None);
    }
}
