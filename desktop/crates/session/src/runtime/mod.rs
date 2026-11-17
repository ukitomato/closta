//! One session's life: plan the launch, check `claude --version`, start the long-lived process,
//! fold what it says, and notice how it ends. SessionRuntime.kt.
//!
//! [`SessionRuntime::new`] hands out the handle (status, view, commands, close) and the
//! [`SessionRun`], one future the platform runs in the background. Inside it the
//! [`ClaudeSession`] pump and the fold run together with no task and no thread of their own;
//! only the synchronous spawns go to the blocking pool.

use std::fmt;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use async_channel::{Receiver, Sender};
use closta_model::AgentEvent;
use closta_presenter::input::{Launched, PresenterInput};
use closta_presenter::records::operations::asks_for_settings;
use closta_presenter::session::SessionView;
use closta_providers::claude::launch::spec::LaunchSpec;
use closta_providers::claude::launch::version::{VERSION_TIMEOUT, check_version_within};
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{AgentProcess, ProcessSpawner};
use closta_providers::claude::session::{ClaudeSession, PumpEnd, StartedSession};
use futures_lite::future;

use crate::clock::SystemClock;
use crate::commands::SessionCommands;
use crate::launch::{SessionLaunch, SessionLaunchPlanner};
use crate::live::{LiveProcesses, Tracked};
use crate::log::SessionLog;
use crate::sandbox::SandboxStartWatch;
use crate::status::{SessionFailure, SessionStatus};
use crate::store::ConversationStore;

/// How long a close waits for the process to end before it kills it.
pub const CLOSE_WAIT: Duration = Duration::from_secs(5);
/// How long a close waits for a killed process to end before it gives up.
pub const KILL_WAIT: Duration = Duration::from_secs(2);

/// The life of one session, for the platform to run in the background. It returns once the
/// session has ended, failed or been closed.
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
            .finish_non_exhaustive()
    }
}

/// The status, and the commands that go with it: changed together, under one lock.
struct State {
    status: SessionStatus,
    commands: Option<Arc<SessionCommands>>,
    watchers: Vec<Sender<SessionStatus>>,
}

impl State {
    /// Writes `status` and `commands` unless the session was closed, and tells every watcher.
    /// Returns whether it was written.
    fn set(&mut self, status: SessionStatus, commands: Option<Arc<SessionCommands>>) -> bool {
        // Closed is the last status: nothing overwrites it.
        if self.status == SessionStatus::Closed {
            return false;
        }
        self.status = status;
        self.commands = commands;
        let status = &self.status;
        self.watchers
            .retain(|watcher| watcher.try_send(status.clone()).is_ok());
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
        let shared = Arc::new(Shared {
            id: config.id.clone(),
            store: Arc::new(ConversationStore::default()),
            state: Mutex::new(State {
                status: SessionStatus::Starting,
                commands: None,
                watchers: Vec::new(),
            }),
            live: LiveProcesses::default(),
            closing,
        });
        let run = Box::pin(run(Arc::clone(&shared), config, closed));
        (SessionRuntime { shared }, run)
    }

    pub fn id(&self) -> &str {
        &self.shared.id
    }

    /// Where the session is now.
    pub fn status(&self) -> SessionStatus {
        self.shared.state().status.clone()
    }

    /// Every status from now on, the current one first. The channel is unbounded and does not
    /// close; a receiver that is dropped is let go at the next status.
    pub fn watch_status(&self) -> Receiver<SessionStatus> {
        let (sender, receiver) = async_channel::unbounded();
        let mut state = self.shared.state();
        _ = sender.try_send(state.status.clone());
        state.watchers.push(sender);
        receiver
    }

    /// The conversation and its transcript.
    pub fn view(&self) -> SessionView {
        self.shared.store.view()
    }

    /// A ping after each change of the view; it holds at most one.
    pub fn watch_view(&self) -> Receiver<()> {
        self.shared.store.watch()
    }

    /// The commands of the running session; `None` while it is not running.
    pub fn commands(&self) -> Option<Arc<SessionCommands>> {
        self.shared.state().commands.clone()
    }

    /// Closes the session: the status is Closed for good, the commands are revoked, and the run
    /// lets go of what it holds and returns.
    pub fn close(&self) {
        {
            let mut state = self.shared.state();
            if let Some(commands) = state.commands.take() {
                commands.revoke();
            }
            state.set(SessionStatus::Closed, None);
        }
        self.shared.closing.close();
    }
}

async fn run(shared: Arc<Shared>, config: SessionConfig, closed: Receiver<()>) {
    let life = life(&shared, &config);
    let outcome = future::or(async { Some(life.await) }, async {
        _ = closed.recv().await;
        None
    })
    .await;
    // A spawn still under way when the run returns finds the list closed, and is killed.
    shared.live.destroy_all();
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

/// The session from its plan to its end, as the status it ends in.
async fn life(shared: &Arc<Shared>, config: &SessionConfig) -> SessionStatus {
    let id = &config.id;
    let mode = (config.start_mode)();
    let planned = match config
        .planner
        .plan(id, config.working_directory.as_deref())
        .await
    {
        Ok(planned) => planned,
        Err(failure) => return SessionStatus::Failed(failure),
    };
    let planned = with_choices(planned, config.effort.as_deref(), mode, config.sandbox);
    let spawner = planned.spawner;
    let distro = spawner.wsl_distro().map(str::to_owned);
    let failed =
        |failure: SessionFailure| SessionStatus::Failed(failure.for_spawner(distro.as_deref()));
    // A spec that contradicts itself is a plan that failed.
    let Ok(launch) = Launch::of(&planned.spec) else {
        return SessionStatus::Failed(SessionFailure::PlanFailed);
    };

    let check = launch.version_check();
    let spawned = spawn(shared, Arc::clone(&spawner), check.clone());
    let version = match check_version_within(
        async {
            spawned
                .await
                .map(|tracked| Box::new(tracked) as Box<dyn AgentProcess>)
        },
        config.version_timeout,
    )
    .await
    {
        Ok(version) => version,
        Err(failure) => return failed(SessionFailure::from_version(failure)),
    };
    config.log.info(&format!(
        "claude session {id}: {:?} -> {version}",
        check.args
    ));

    let process = match spawn(shared, spawner, launch.clone()).await {
        Ok(process) => process,
        Err(error) => return failed(SessionFailure::from_launch(&error)),
    };
    config
        .log
        .info(&format!("claude session {id}: started {:?}", launch.args));

    let StartedSession {
        session,
        events,
        pump,
    } = ClaudeSession::start(Box::new(process), id);
    let sandboxed = planned.spec.sandbox;
    // The view says the effort from its first snapshot on, before the session runs; a session
    // with no effort says nothing, unless it is in the sandbox.
    if config.effort.is_some() || sandboxed {
        let launched = PresenterInput::Launched(Launched {
            effort: config.effort.clone(),
            built_in_mcp_servers: Vec::new(),
            sandbox: sandboxed,
        });
        shared.store.transition(|view| view.fold(&launched));
    }
    let commands = Arc::new(SessionCommands::new(
        Arc::new(session),
        Arc::new(SystemClock),
        Arc::clone(&shared.store),
    ));
    let running = SessionStatus::Running {
        version: version.clone(),
    };
    if !shared.state().set(running, Some(Arc::clone(&commands))) {
        // Closed meanwhile: the run is about to return.
        commands.revoke();
    }
    // A CLI in the sandbox is asked its settings at once, so a session that writes no
    // `initialize` still learns whether the sandbox is on.
    if sandboxed {
        ask_settings(&commands, config);
    }

    let folding = async {
        let mut watch = SandboxStartWatch::new(sandboxed);
        let mut asked = sandboxed;
        while let Ok(event) = events.recv().await {
            for event in watch.pass(event) {
                asked |= fold_event(shared, &commands, config, event, asked);
            }
        }
    };
    let (end, ()) = future::zip(pump, folding).await;
    commands.revoke();
    match end {
        PumpEnd::Failed(failure) => failed(SessionFailure::from_exit(failure)),
        // The run holds the receiver of the events, so the pump is never abandoned.
        PumpEnd::Ended | PumpEnd::Abandoned => SessionStatus::Ended,
    }
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

/// Folds one event. The settings are asked for at the first `system/init` (a session with no
/// `initialize`), and after an answer that calls for them, read on the records before the event
/// is folded. Returns whether they were asked.
fn fold_event(
    shared: &Shared,
    commands: &SessionCommands,
    config: &SessionConfig,
    event: AgentEvent,
    asked: bool,
) -> bool {
    let first_init = !asked && matches!(event, AgentEvent::SystemInit { .. });
    let asks = shared.store.transition_with(|view| {
        let asks = first_init || asks_for_settings(&view.transcript.operations, &event);
        (view.fold(&PresenterInput::Event(event)), asks)
    });
    if asks {
        ask_settings(commands, config);
    }
    asks
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
/// permission mode and the sandbox. With none of them the plan is used as it came, its sandbox
/// included.
fn with_choices(
    planned: SessionLaunch,
    effort: Option<&str>,
    mode: Option<String>,
    sandbox: bool,
) -> SessionLaunch {
    if effort.is_none() && mode.is_none() && !sandbox {
        return planned;
    }
    let spec = planned.spec;
    SessionLaunch {
        spawner: planned.spawner,
        spec: LaunchSpec {
            effort: effort.map(str::to_owned).or(spec.effort),
            permission_mode: mode.or(spec.permission_mode),
            sandbox,
            ..spec
        },
    }
}

#[cfg(test)]
mod tests {
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
        let as_planned = with_choices(planned(|spec| spec.sandbox = true), None, None, false);
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
        );
        assert_eq!(chosen.spec.effort.as_deref(), Some("high"));
        assert_eq!(chosen.spec.permission_mode.as_deref(), Some("plan"));
        assert!(!chosen.spec.sandbox);

        let mode = with_choices(planned(|_| {}), None, Some("auto".into()), true);
        assert_eq!(mode.spec.effort, None);
        assert_eq!(mode.spec.permission_mode.as_deref(), Some("auto"));
        assert!(mode.spec.sandbox);
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
        assert_eq!(config.close_wait, CLOSE_WAIT);
        assert_eq!(config.kill_wait, KILL_WAIT);
        assert_eq!(config.version_timeout, VERSION_TIMEOUT);
        assert_eq!((config.start_mode)(), None);
    }
}
