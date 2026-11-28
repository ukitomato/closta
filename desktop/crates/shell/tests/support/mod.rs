#![allow(dead_code, clippy::expect_used, clippy::unwrap_used)]
//! The shell's test harness: a shell over sessions made of in-memory processes.

use std::collections::VecDeque;
use std::future::Future;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use closta_core::ports::SavedSessions;
use closta_model::AppInfo;
use closta_providers::claude::fake::live::{LiveControl, LiveOptions, LiveProcess};
use closta_providers::claude::fake::process::{FakeProcess, ProcessScript};
use closta_providers::claude::fake::replay::{
    ReplayControl, ReplayOptions, ReplaySpawner, parse_replay,
};
use closta_providers::claude::fake::saved::FakeSavedSessions;
use closta_providers::claude::fake::spawner::FakeSpawner;
use closta_providers::claude::launch::Launch;
use closta_providers::claude::launch::LaunchError;
use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::process::AgentProcess;
use closta_session::history::{SavedListing, listing};
use closta_session::launch::{NativeSessionLaunchPlanner, SessionLaunchPlanner};
use closta_session::log::SessionLog;
use closta_session::runtime::SessionRuntime;
use closta_session::status::SessionStatus;
use closta_shell::header::app_header;
use closta_shell::new_session::{ClaudeOnPath, LaunchChecks, PlannerFor, SavedFor};
use closta_shell::settings::{MemorySettings, Settings, SettingsSink};
use closta_shell::slot::{SlotId, SlotLaunch, Spawn};
use closta_shell::state::{Ports, ShellAction, ShellState};
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
    /// The arguments of each session process asked for, in order.
    pub launches: Vec<Vec<String>>,
}

pub struct Harness {
    pub executor: Arc<Executor<'static>>,
    pub answers: Arc<Mutex<Answers>>,
    pub planner: Arc<NativeSessionLaunchPlanner>,
    pub saved_for: Arc<FakeSavedFor>,
}

impl Harness {
    pub fn new(executor: Arc<Executor<'static>>) -> Harness {
        let answers = Arc::new(Mutex::new(Answers::default()));
        let held = Arc::clone(&answers);
        let spawner = FakeSpawner::answering(move |launch: &Launch| {
            if launch.args == ["--version"] {
                let script = ProcessScript::replaying(vec!["2.1.325 (Claude Code)".to_owned()]);
                let (process, _probe) = FakeProcess::new(script);
                return Ok(Box::new(process) as Box<dyn AgentProcess>);
            }
            let mut answers = held.lock().unwrap_or_else(PoisonError::into_inner);
            answers.launches.push(launch.args.clone());
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
            saved_for: Arc::new(FakeSavedFor::default()),
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
            planner_for: Arc::new(Planners::new(Arc::clone(&self.planner) as _)),
            settings: Arc::new(MemorySettings),
            saved_for: Arc::clone(&self.saved_for) as _,
        }
    }

    /// A shell whose settings writer records what it is given.
    pub fn shell_recording(&self) -> (ShellState, Arc<RecordingSettings>) {
        let recording = Arc::new(RecordingSettings::default());
        let mut ports = self.ports();
        ports.settings = Arc::clone(&recording) as _;
        (self.shell_with(ports), recording)
    }

    /// A launch of the harness's planner in `folder`, as a session started there is.
    pub fn folder_launch(&self, folder: &str) -> SlotLaunch {
        SlotLaunch {
            title: folder.to_owned(),
            planner: Arc::clone(&self.planner) as _,
            working_directory: Some(folder.to_owned()),
            companion: None,
            relaunch: None,
            project: Some(folder.to_owned()),
            settles_on_failure: false,
            session_id: None,
            resume: None,
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
            project: None,
            settles_on_failure: false,
            session_id: None,
            resume: None,
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

    /// The arguments session process `n` was asked for with, once it is asked for.
    pub async fn launch_args(&self, n: usize) -> Vec<String> {
        let answers = Arc::clone(&self.answers);
        until(move || {
            answers
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .launches
                .len()
                > n
        })
        .await;
        self.answers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .launches[n]
            .clone()
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
    /// How many times a folder was looked for.
    pub looks: AtomicUsize,
}

impl Machine {
    /// How many times a folder was looked for.
    pub fn folder_looks(&self) -> usize {
        self.looks.load(Ordering::SeqCst)
    }
}

impl Default for Machine {
    fn default() -> Machine {
        Machine {
            distros: vec!["Ubuntu-26.04".to_owned()],
            claude: ClaudeOnPath::Found,
            folders: None,
            looks: AtomicUsize::new(0),
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
        self.looks.fetch_add(1, Ordering::SeqCst);
        let exists = self
            .folders
            .as_ref()
            .is_none_or(|folders| folders.iter().any(|it| it == folder));
        Box::pin(async move { exists })
    }
}

/// Every folder starts the harness's planner.
pub struct Planners {
    planner: Arc<dyn SessionLaunchPlanner>,
    asked: AtomicUsize,
}

impl Planners {
    pub fn new(planner: Arc<dyn SessionLaunchPlanner>) -> Planners {
        Planners {
            planner,
            asked: AtomicUsize::new(0),
        }
    }

    /// How many times a planner was asked for.
    pub fn planned(&self) -> usize {
        self.asked.load(Ordering::SeqCst)
    }
}

impl PlannerFor for Planners {
    fn planner(&self, _folder: &str) -> Arc<dyn SessionLaunchPlanner> {
        self.asked.fetch_add(1, Ordering::SeqCst);
        Arc::clone(&self.planner)
    }
}

/// The saved sessions of each project folder: one fake per folder, made on first ask. Its list
/// reads the fake only once the future is polled, as a real one reads in the background.
#[derive(Default)]
pub struct FakeSavedFor {
    fakes: Mutex<Vec<(String, Arc<FakeSavedSessions>)>>,
    started: Arc<AtomicUsize>,
    asked: AtomicUsize,
    /// The `stop` of each list asked for, in order.
    stops: Mutex<Vec<Arc<AtomicBool>>>,
}

impl FakeSavedFor {
    /// The fakes made so far, in the order their folders were first asked for.
    pub fn fakes(&self) -> Vec<Arc<FakeSavedSessions>> {
        let fakes = self.fakes.lock().unwrap_or_else(PoisonError::into_inner);
        fakes.iter().map(|(_, fake)| Arc::clone(fake)).collect()
    }

    /// How many lists were polled.
    pub fn lists_started(&self) -> usize {
        self.started.load(Ordering::SeqCst)
    }

    /// Makes `fake` the saved sessions of `folder`, before anything asks for them.
    pub fn put(&self, folder: &str, fake: FakeSavedSessions) -> Arc<FakeSavedSessions> {
        let fake = Arc::new(fake);
        let mut fakes = self.fakes.lock().unwrap_or_else(PoisonError::into_inner);
        assert!(fakes.iter().all(|(kept, _)| kept != folder), "put once");
        fakes.push((folder.to_owned(), Arc::clone(&fake)));
        fake
    }

    /// How many lists were asked for, polled or not.
    pub fn lists_asked(&self) -> usize {
        self.stops
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .len()
    }

    /// Whether the `stop` of list `n` (0 is the first asked for) is true.
    pub fn stopped(&self, n: usize) -> bool {
        self.stops.lock().unwrap_or_else(PoisonError::into_inner)[n].load(Ordering::SeqCst)
    }

    /// How many times `saved` was called.
    pub fn saved_asked(&self) -> usize {
        self.asked.load(Ordering::SeqCst)
    }

    fn fake_of(&self, folder: &str) -> Arc<FakeSavedSessions> {
        let mut fakes = self.fakes.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some((_, fake)) = fakes.iter().find(|(kept, _)| kept == folder) {
            return Arc::clone(fake);
        }
        let fake = Arc::new(FakeSavedSessions::default());
        fakes.push((folder.to_owned(), Arc::clone(&fake)));
        fake
    }
}

impl SavedFor for FakeSavedFor {
    fn saved(&self, folder: &str) -> Arc<dyn SavedSessions> {
        self.asked.fetch_add(1, Ordering::SeqCst);
        self.fake_of(folder)
    }

    fn list(&self, folder: &str, stop: Arc<AtomicBool>) -> future::Boxed<Option<SavedListing>> {
        let fake = self.fake_of(folder);
        self.stops
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(Arc::clone(&stop));
        let started = Arc::clone(&self.started);
        Box::pin(async move {
            started.fetch_add(1, Ordering::SeqCst);
            listing(
                Some(&*fake as &dyn SavedSessions),
                &|| stop.load(Ordering::SeqCst),
                &Quiet,
            )
        })
    }
}

/// A settings writer that keeps every value it was given.
#[derive(Default)]
pub struct RecordingSettings {
    saved: Mutex<Vec<Settings>>,
}

impl RecordingSettings {
    pub fn saves(&self) -> Vec<Settings> {
        self.saved
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

impl SettingsSink for RecordingSettings {
    fn save(&self, settings: Settings) {
        self.saved
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(settings);
    }
}

/// A launch of the harness's planner whose relaunch makes the same launch again.
pub fn relaunchable(harness: &Harness, title: &'static str) -> SlotLaunch {
    fn make(planner: Arc<dyn SessionLaunchPlanner>, title: &'static str) -> SlotLaunch {
        let again = Arc::clone(&planner);
        SlotLaunch {
            title: title.to_owned(),
            planner,
            working_directory: None,
            companion: None,
            relaunch: Some(Arc::new(move || make(Arc::clone(&again), title))),
            project: None,
            settles_on_failure: false,
            session_id: None,
            resume: None,
        }
    }
    make(Arc::clone(&harness.planner) as _, title)
}

/// A launch that plays the first `stop_at` lines of the capture `fixture` (a file name with its
/// extension) and then stays alive; with the replay's control and the slot's runtime.
pub fn replay_launch(
    harness: &Harness,
    fixture: &str,
    stop_at: usize,
) -> (
    SlotLaunch,
    ReplayControl,
    async_channel::Receiver<SessionRuntime>,
) {
    let lines = parse_replay(&crate::common::text_of(fixture)).unwrap();
    let (spawner, control) = ReplaySpawner::new(
        lines,
        ReplayOptions {
            stop_at: Some(stop_at),
            ..ReplayOptions::default()
        },
    );
    let planner = Arc::new(NativeSessionLaunchPlanner::new(
        Arc::new(spawner),
        Arc::new(SecretEnv::default),
    ));
    let (mut launch, runtime) = harness.launch(fixture);
    launch.planner = planner;
    (launch, control, runtime)
}

/// Writes lines 1 to `last` of the capture `fixture` to the fake process's stdout.
pub fn emit_capture(control: &LiveControl, fixture: &str, last: usize) {
    let text = crate::common::text_of(fixture);
    for line in crate::common::non_blank_lines(&text).into_iter().take(last) {
        control.emit(&line);
    }
}

/// The line (counted from 1 over the non-blank lines) and the request id of a permission request
/// found in a capture.
#[derive(Debug, PartialEq, Eq)]
pub struct Ask {
    pub line: usize,
    pub request_id: String,
}

impl Ask {
    pub fn id(&self) -> &str {
        &self.request_id
    }
}

/// The `nth` (from 1) `can_use_tool` request for `tool` in the capture `fixture`.
pub fn ask_in(fixture: &str, tool: &str, nth: usize) -> Ask {
    ask_in_text(fixture, &crate::common::text_of(fixture), tool, nth)
}

/// The `nth` (from 1) `can_use_tool` request for `tool` in `text`, which `name` stands for in the
/// failure messages. A request with no `request_id` fails.
pub fn ask_in_text(name: &str, text: &str, tool: &str, nth: usize) -> Ask {
    crate::common::non_blank_lines(text)
        .iter()
        .enumerate()
        .filter_map(|(at, line)| {
            let value: serde_json::Value = serde_json::from_str(line).ok()?;
            let request = value.get("request")?;
            let is_ask = value.get("type")?.as_str()? == "control_request"
                && request.get("subtype")?.as_str()? == "can_use_tool"
                && request.get("tool_name")?.as_str()? == tool;
            is_ask.then(|| Ask {
                line: at + 1,
                request_id: value
                    .get("request_id")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_else(|| {
                        panic!(
                            "{name}: can_use_tool #{nth} for {tool} (line {}) has no request_id",
                            at + 1
                        )
                    })
                    .to_owned(),
            })
        })
        .nth(nth - 1)
        .unwrap_or_else(|| panic!("{name}: no can_use_tool #{nth} for {tool}"))
}

/// The baseline capture.
pub const BASELINE: &str = "01-baseline-text.ndjson";
/// The baseline capture's first text delta: its turn is open.
pub const BASELINE_OPEN: usize = 10;
/// The baseline capture's last line.
pub const BASELINE_ALL: usize = 17;

/// A permission request shaped like capture 36's 31st line, with another id and command (not
/// tied to the capture).
pub fn can_use_tool(request_id: &str, command: &str) -> String {
    serde_json::json!({
        "type": "control_request",
        "request_id": request_id,
        "request": {
            "subtype": "can_use_tool",
            "tool_name": "Bash",
            "display_name": "Bash",
            "input": { "command": command, "description": "Run the command" },
            "description": "Run the command",
            "permission_suggestions": [],
            "tool_use_id": "toolu_017CVefXNn36voSSZ6qdMcrn"
        }
    })
    .to_string()
}

/// The runtime waits on `n` approvals.
pub async fn waits_on(runtime: &SessionRuntime, n: usize) {
    until(|| runtime.view().conversation.pending_approvals.len() == n).await;
}

/// Opens a replay of `fixture` up to `stop_at`, waits until it waits on one request and
/// refreshes the slot at `now_ms`.
pub async fn waiting_slot(
    shell: &mut ShellState,
    harness: &Harness,
    fixture: &str,
    stop_at: usize,
    now_ms: i64,
) -> (SlotId, ReplayControl, SessionRuntime) {
    let (launch, control, runtime) = replay_launch(harness, fixture, stop_at);
    let slot = shell.open(launch);
    let runtime = runtime.recv().await.unwrap();
    running(&runtime).await;
    waits_on(&runtime, 1).await;
    let generation = shell.watch(slot).unwrap().generation();
    shell.refresh(slot, generation, now_ms).unwrap();
    (slot, control, runtime)
}

/// Capture 41: a turn, `/clear`, then a turn of the conversation the clear started.
pub const CLEARED: &str = "41-clear-reset.ndjson";
/// 41's session before the `/clear` (its non-blank lines 2 to 18).
pub const BEFORE_CLEAR: &str = "a6635625-53e9-40b5-adfb-977a4e9163b2";
/// 41's session after the `/clear`: the init after the reset (non-blank line 20) names it.
pub const AFTER_CLEAR: &str = "b3c1b6ae-517a-4b6a-8b61-f3693facb4f1";
/// What the host sent in 41 (CaptureReplay.kt's SENT): the capture has no line of the user's.
pub const CLEARED_SENT: [&str; 3] = [
    "Remember the word kumquat. Respond with exactly one word: pong",
    "/clear",
    "Which word did I ask you to remember? If you do not know, respond with exactly: unknown",
];

/// A slot of `launch` (a launch in a folder, with its relaunch) under 41's first session id,
/// whose companion hands over the runtime; it returns once the session runs.
pub async fn open_cleared(
    harness: &Harness,
    shell: &mut ShellState,
    launch: SlotLaunch,
    n: usize,
) -> (SlotId, SessionRuntime, LiveControl) {
    let (with_runtime, runtime) = harness.launch("41");
    let slot = shell.open(SlotLaunch {
        session_id: Some(BEFORE_CLEAR.to_owned()),
        companion: with_runtime.companion,
        ..launch
    });
    let runtime = runtime.recv().await.unwrap();
    until(|| runtime.commands().is_some()).await;
    let control = harness.control(n).await;
    control.skip_initialize().await;
    (slot, runtime, control)
}

/// Sends `text` from the slot and waits until the process has read it.
pub async fn send_text(shell: &mut ShellState, slot: SlotId, control: &LiveControl, text: &str) {
    shell.act(ShellAction::EditDraft {
        slot,
        text: text.to_owned(),
    });
    shell.act(ShellAction::Send { slot });
    control.next_stdin_line().await.expect("the request");
}

/// Reads the slot again at time 0.
pub fn refresh_slot(shell: &mut ShellState, slot: SlotId) {
    let generation = shell.watch(slot).unwrap().generation();
    shell.refresh(slot, generation, 0).unwrap();
}

/// Plays capture 41 as the host lives it, up to its non-blank line `through` (counted from 1):
/// the first request sent, its turn (lines 2 to 14), `/clear` sent, then lines 15 to `through`.
/// Line 1 answers the initialize, which the live process answered. It returns once both sends
/// and the reset are folded (and the init after it, from line 20) and the slot has read them.
pub async fn play_cleared(
    shell: &mut ShellState,
    slot: SlotId,
    runtime: &SessionRuntime,
    control: &LiveControl,
    through: usize,
) {
    play_reset(shell, slot, runtime, control, through, true).await;
}

/// [`play_cleared`], with line 18's reset saying no trigger (nor the `/clear` message's uuid,
/// which comes only with the `clear` trigger) when `as_clear` is false: a reset that is not a
/// `/clear`.
pub async fn play_reset(
    shell: &mut ShellState,
    slot: SlotId,
    runtime: &SessionRuntime,
    control: &LiveControl,
    through: usize,
    as_clear: bool,
) {
    assert!(through >= 18, "the reset is line 18");
    let mut lines = crate::common::non_blank_lines(&crate::common::text_of(CLEARED));
    if !as_clear {
        let mut reset: serde_json::Value = serde_json::from_str(&lines[17]).unwrap();
        assert_eq!(reset["type"], "conversation_reset");
        assert_eq!(reset["trigger"], "clear");
        let fields = reset.as_object_mut().unwrap();
        fields.remove("trigger");
        fields.remove("user_message_uuid");
        lines[17] = reset.to_string();
    }
    send_text(shell, slot, control, CLEARED_SENT[0]).await;
    for line in &lines[1..14] {
        control.emit(line);
    }
    send_text(shell, slot, control, CLEARED_SENT[1]).await;
    for line in &lines[14..through] {
        control.emit(line);
    }
    until(|| {
        let view = runtime.view();
        view.transcript.routing.sends == 2
            && view.transcript.cleared_at.is_some()
            && (through < 20) == view.conversation.session.is_none()
    })
    .await;
    if through >= 22 {
        until(|| {
            let view = runtime.view();
            !closta_presenter::thread_running::thread_is_running(
                &view.conversation,
                &view.transcript,
            )
        })
        .await;
    }
    assert!(runtime.sent());
    refresh_slot(shell, slot);
}

/// After [`play_cleared`] through line 22: sends 41's third request and plays lines 23 to the
/// last, then reads the slot once that turn is over.
pub async fn play_after_clear(
    shell: &mut ShellState,
    slot: SlotId,
    runtime: &SessionRuntime,
    control: &LiveControl,
) {
    let lines = crate::common::non_blank_lines(&crate::common::text_of(CLEARED));
    send_text(shell, slot, control, CLEARED_SENT[2]).await;
    for line in &lines[22..] {
        control.emit(line);
    }
    until(|| {
        let view = runtime.view();
        view.transcript.routing.sends == 3
            && !closta_presenter::thread_running::thread_is_running(
                &view.conversation,
                &view.transcript,
            )
    })
    .await;
    refresh_slot(shell, slot);
}

/// Ends the slot's process and waits until its run has returned and the slot shows it ended.
pub async fn end_slot(shell: &mut ShellState, slot: SlotId, control: &LiveControl) {
    let mut watch = shell.watch(slot).unwrap();
    control.exit(0);
    while watch.changed().await {}
    shell.refresh(slot, watch.generation(), 0).unwrap();
    assert_eq!(shell.status(slot), Some(SessionStatus::Ended));
}
