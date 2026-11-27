//! A capture replayed through a fake process, for the app's development replay. The replay file is
//! the capture's stdout lines with cue lines added: a cue stands for what the capture cannot hold
//! (the user's prompt, the answer to a request), and the replay waits at it until the host writes
//! the matching line to stdin.

use std::fs::File;
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use async_io::Timer;
use futures_lite::{future, stream};
use serde_json::{Map, Value};

use crate::claude::fake::live::{LiveControl, LiveOptions, LiveProcess};
use crate::claude::fake::process::{FakeProcess, ProcessScript};
use crate::claude::launch::{Launch, LaunchError};
use crate::claude::process::{AgentProcess, ProcessFailure, ProcessSpawner};
use crate::claude::protocol::json::parse_line;

/// The key that makes a line of a replay file a cue: `{"closta_replay":"user","text":…}` or
/// `{"closta_replay":"answer","request_id":…,"allow":true}`.
pub const REPLAY_KEY: &str = "closta_replay";

/// What the replay answers to `claude --version`.
pub const VERSION_LINE: &str = "2.1.325 (Claude Code)";

const USER: &str = "user";
const ANSWER: &str = "answer";

/// A point in the replay that waits for the host.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum ReplayCue {
    /// The user sends `text`: the replay goes on once a `user` line is written to stdin.
    User { text: String },
    /// The user answers the request `request_id`: the replay goes on once the `control_response`
    /// to that request is written to stdin.
    Answer { request_id: String, allow: bool },
}

impl ReplayCue {
    /// The cue as a line of a replay file.
    pub fn to_line(&self) -> String {
        let mut object = Map::new();
        match self {
            ReplayCue::User { text } => {
                object.insert(REPLAY_KEY.into(), USER.into());
                object.insert("text".into(), text.as_str().into());
            }
            ReplayCue::Answer { request_id, allow } => {
                object.insert(REPLAY_KEY.into(), ANSWER.into());
                object.insert("request_id".into(), request_id.as_str().into());
                object.insert("allow".into(), (*allow).into());
            }
        }
        Value::Object(object).to_string()
    }

    /// Whether `stdin_line` is what the replay waits for at this cue.
    pub fn answered_by(&self, stdin_line: &str) -> bool {
        let Ok(line) = parse_line(stdin_line) else {
            return false;
        };
        let kind = line.get("type").and_then(Value::as_str);
        match self {
            ReplayCue::User { .. } => kind == Some("user"),
            ReplayCue::Answer { request_id, .. } => {
                kind == Some("control_response")
                    && line
                        .get("response")
                        .and_then(|response| response.get("request_id"))
                        .and_then(Value::as_str)
                        == Some(request_id.as_str())
            }
        }
    }

    fn of(object: &Map<String, Value>) -> Option<ReplayCue> {
        let text = |key: &str| object.get(key).and_then(Value::as_str).map(str::to_owned);
        match object.get(REPLAY_KEY)?.as_str()? {
            USER => Some(ReplayCue::User {
                text: text("text")?,
            }),
            ANSWER => Some(ReplayCue::Answer {
                request_id: text("request_id")?,
                allow: object.get("allow")?.as_bool()?,
            }),
            _ => None,
        }
    }
}

/// One line of a replay file.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum ReplayLine {
    /// A line the process writes to stdout as it is.
    Stdout(String),
    /// A point where the replay waits for the host. Never written to stdout.
    Cue(ReplayCue),
}

/// Why a replay file cannot be played. It names the line, never what the line holds.
#[derive(Clone, Copy, PartialEq, Eq, Debug, thiserror::Error)]
pub enum ReplayError {
    /// The line, counted from 1, has the cue key but is not a cue: an unknown kind or a field
    /// missing.
    #[error("line {line} of the replay is not a valid cue")]
    BadCue { line: usize },
}

/// Reads a replay file. Blank lines are dropped; a JSON object with [`REPLAY_KEY`] is a cue, and
/// every other line goes to stdout as it is.
pub fn parse_replay(text: &str) -> Result<Vec<ReplayLine>, ReplayError> {
    text.lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty())
        .map(|(index, line)| replay_line(index + 1, line))
        .collect()
}

fn replay_line(number: usize, line: &str) -> Result<ReplayLine, ReplayError> {
    // A line without the key cannot be a cue; this skips parsing the capture's own lines.
    if !line.contains(REPLAY_KEY) {
        return Ok(ReplayLine::Stdout(line.to_owned()));
    }
    match parse_line(line) {
        Ok(object) if object.contains_key(REPLAY_KEY) => ReplayCue::of(&object)
            .map(ReplayLine::Cue)
            .ok_or(ReplayError::BadCue { line: number }),
        _ => Ok(ReplayLine::Stdout(line.to_owned())),
    }
}

/// `lines` with the user's prompt `text` first.
pub fn with_prompt(mut lines: Vec<ReplayLine>, text: &str) -> Vec<ReplayLine> {
    lines.insert(
        0,
        ReplayLine::Cue(ReplayCue::User {
            text: text.to_owned(),
        }),
    );
    lines
}

/// How a replay is played.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct ReplayOptions {
    /// The wait between two stdout lines. Zero writes them all at once.
    pub pace: Duration,
    /// Stops after the n-th stdout line (cues are not counted). The process stays alive.
    pub stop_at: Option<usize>,
    /// The file each stdin line is appended to as it is written.
    pub stdin_log: Option<PathBuf>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

struct Shared {
    // The session's process, once it started.
    live: Mutex<Option<LiveControl>>,
    cues: async_channel::Receiver<ReplayCue>,
    // Never carries a value: closed when the replay reached its end. Held here so that a replay
    // dropped half way does not look finished.
    done: async_channel::Sender<()>,
    finished: async_channel::Receiver<()>,
}

/// The host's side of a replay.
#[derive(Clone)]
pub struct ReplayControl {
    shared: Arc<Shared>,
}

impl ReplayControl {
    /// The cues as the replay reaches them. A cue can arrive before the host has taken in the
    /// lines before it; the sender waits for that. The channel closes when the replay ends.
    pub fn cues(&self) -> async_channel::Receiver<ReplayCue> {
        self.shared.cues.clone()
    }

    /// Ends once the last line, or the line of `stop_at`, was written to stdout.
    pub fn finished(&self) -> future::Boxed<()> {
        let finished = self.shared.finished.clone();
        Box::pin(async move {
            _ = finished.recv().await;
        })
    }

    /// The lines written to the session's stdin so far, in order.
    pub fn stdin_lines(&self) -> Vec<String> {
        lock(&self.shared.live)
            .as_ref()
            .map(LiveControl::stdin_lines)
            .unwrap_or_default()
    }
}

// The replay before its session started.
struct Pending {
    lines: Vec<ReplayLine>,
    options: ReplayOptions,
    cues: async_channel::Sender<ReplayCue>,
}

/// A [`ProcessSpawner`] that answers the version check and plays the replay to the first session.
/// A later session launch is refused: a replay is played once.
pub struct ReplaySpawner {
    shared: Arc<Shared>,
    pending: Mutex<Option<Pending>>,
}

impl ReplaySpawner {
    pub fn new(lines: Vec<ReplayLine>, options: ReplayOptions) -> (ReplaySpawner, ReplayControl) {
        let (cues, cues_out) = async_channel::unbounded();
        let (done, finished) = async_channel::bounded(1);
        let shared = Arc::new(Shared {
            live: Mutex::new(None),
            cues: cues_out,
            done,
            finished,
        });
        let spawner = ReplaySpawner {
            shared: Arc::clone(&shared),
            pending: Mutex::new(Some(Pending {
                lines,
                options,
                cues,
            })),
        };
        (spawner, ReplayControl { shared })
    }
}

impl ProcessSpawner for ReplaySpawner {
    fn spawn(&self, launch: &Launch) -> Result<Box<dyn AgentProcess>, LaunchError> {
        if launch.args.iter().any(|arg| arg == "--version") {
            let (process, _) =
                FakeProcess::new(ProcessScript::replaying(vec![VERSION_LINE.to_owned()]));
            return Ok(Box::new(process));
        }
        let mut pending = lock(&self.pending);
        let Some(replay) = pending.take() else {
            return Err(LaunchError::Spawn(io::ErrorKind::Unsupported));
        };
        let log = match replay.options.stdin_log.as_deref().map(File::create) {
            None => None,
            Some(Ok(file)) => Some(Arc::new(Mutex::new(file))),
            Some(Err(failure)) => {
                // Kept for the next launch: the replay was not played.
                *pending = Some(replay);
                return Err(LaunchError::Spawn(failure.kind()));
            }
        };
        let (live, control) = LiveProcess::new(LiveOptions::default());
        *lock(&self.shared.live) = Some(control.clone());
        let drive = drive(replay, control, self.shared.done.clone());
        Ok(Box::new(ReplayProcess {
            live,
            drive: Mutex::new(Some(Box::pin(drive))),
            log,
        }))
    }
}

/// Plays the lines into `live`, holding at each cue until its stdin line is written.
async fn drive(replay: Pending, live: LiveControl, done: async_channel::Sender<()>) {
    let Pending {
        lines,
        options,
        cues,
    } = replay;
    let mut emitted = 0;
    for line in lines {
        if options.stop_at.is_some_and(|last| emitted >= last) {
            break;
        }
        match line {
            ReplayLine::Stdout(text) => {
                if emitted > 0 && !options.pace.is_zero() {
                    Timer::after(options.pace).await;
                }
                live.emit(&text);
                emitted += 1;
            }
            ReplayLine::Cue(cue) => {
                _ = cues.try_send(cue.clone());
                loop {
                    match live.next_stdin_line().await {
                        Some(written) if cue.answered_by(&written) => break,
                        Some(_) => {}
                        // stdin closed: the session is gone and the replay cannot go on.
                        None => return,
                    }
                }
            }
        }
    }
    done.close();
}

/// The process of a replay: a [`LiveProcess`] that the replay drives. The driving runs inside the
/// stderr drain, which the session's pump runs with stdout, so it needs no task or thread.
pub struct ReplayProcess {
    live: LiveProcess,
    // Behind a mutex only so that the process is `Sync`; taking it needs `&mut self`.
    drive: Mutex<Option<future::Boxed<()>>>,
    log: Option<Arc<Mutex<File>>>,
}

impl AgentProcess for ReplayProcess {
    fn take_stdout_lines(&mut self) -> Option<stream::Boxed<Result<String, ProcessFailure>>> {
        self.live.take_stdout_lines()
    }

    /// The inner drain with the replay driven beside it. It ends when the inner drain ends, which
    /// is when the process ends, and not when the replay reaches its end.
    fn take_stderr_drain(&mut self) -> Option<future::Boxed<()>> {
        let drain = self.live.take_stderr_drain()?;
        let drive = self
            .drive
            .get_mut()
            .unwrap_or_else(PoisonError::into_inner)
            .take();
        Some(Box::pin(future::or(drain, async move {
            if let Some(drive) = drive {
                drive.await;
            }
            future::pending::<()>().await;
        })))
    }

    fn write_stdin(&self, line: String) -> future::Boxed<io::Result<()>> {
        let log = self.log.clone().map(|log| (log, format!("{line}\n")));
        let written = self.live.write_stdin(line);
        Box::pin(async move {
            written.await?;
            if let Some((log, line)) = log {
                // The log is a development aid: a failed write must not end the session.
                _ = lock(&log).write_all(line.as_bytes());
            }
            Ok(())
        })
    }

    fn wait(&self) -> future::Boxed<io::Result<i32>> {
        self.live.wait()
    }

    fn destroy(&self) {
        self.live.destroy();
    }

    fn destroy_forcibly(&self) {
        self.live.destroy_forcibly();
    }

    fn id(&self) -> Option<u32> {
        None
    }
}
