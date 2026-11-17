//! The production [`AgentSession`]: one long-lived `claude` process driven over stream-json.
//! Mirrors ClaudeSession.kt.
//!
//! [`ClaudeSession::start`] hands out three parts: the handle that sends, the receiver of the
//! events, and the pump, a [`Future`] the caller runs. The pump reads stdout, writes the queued
//! stdin lines and drains stderr in one future, with no task and no thread of its own. Kotlin
//! bound the same work to the coroutine that collected `events`.
//!
//! Dropping one part alone:
//! - the handle: the writer writes what is queued, then closes stdin; the CLI ends on that and
//!   the pump ends as the CLI did (usually [`PumpEnd::Ended`]).
//! - the receiver: the pump notices at the next line and ends as [`PumpEnd::Abandoned`].
//! - the pump: the writer stops and the process is destroyed at once. The process goes with the
//!   pump, so its own `Drop` kills it.

use std::future::Future;
use std::io;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};

use async_channel::{Receiver, Sender};
use closta_core::ports::{AgentSession, SendError};
use closta_model::{AgentEvent, ApprovalDecision, Attachment};
use futures_lite::{StreamExt, future, stream};

use crate::claude::process::{AgentProcess, ProcessFailure};
use crate::claude::protocol::{decode, encode};

/// The sending side of a session. Every command queues one line for stdin and never waits; once
/// the session has ended, or a write has failed, it is refused with [`SendError::Closed`].
pub struct ClaudeSession {
    stdin: Sender<String>,
    session_id: String,
}

/// What [`ClaudeSession::start`] hands out.
pub struct StartedSession {
    pub session: ClaudeSession,
    /// The events, one per stdout line, in order. It closes when the pump ends.
    pub events: Receiver<AgentEvent>,
    pub pump: SessionPump,
}

/// How a pump ended.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum PumpEnd {
    /// stdout closed and the exit code was 0.
    Ended,
    /// stdout broke, or the exit code was not 0.
    Failed(ProcessFailure),
    /// The receiver of the events was dropped.
    Abandoned,
}

enum Stage {
    Running(future::Boxed<PumpEnd>),
    Done(PumpEnd),
}

/// The work that keeps a session going. It ends when stdout ends; then, or when it is dropped
/// earlier, it stops the writer, destroys the process and refuses every later send.
pub struct SessionPump {
    stage: Stage,
    process: Arc<dyn AgentProcess>,
    // A receiver, not a sender: holding a sender would keep the queue open after the handle is
    // dropped. Boxed because a receiver is not `Unpin`.
    stdin: Box<Receiver<String>>,
}

impl ClaudeSession {
    /// Starts talking to `process`. Nothing runs until the pump is polled; sends before that wait
    /// in the queue.
    pub fn start(mut process: Box<dyn AgentProcess>, session_id: &str) -> StartedSession {
        let lines = process.take_stdout_lines();
        let drain = process.take_stderr_drain();
        let process: Arc<dyn AgentProcess> = Arc::from(process);
        // Both unbounded: sends may come before the pump runs, and the stdout reader must never
        // wait for the receiver (a stopped reader stalls the pipe, measured at 200 KB over WSL).
        let (stdin_tx, stdin_rx) = async_channel::unbounded();
        let (events_tx, events_rx) = async_channel::unbounded();

        let reading = read_stdout(lines, events_tx);
        let writing = write_stdin(Arc::clone(&process), stdin_rx.clone());
        let draining = async move {
            if let Some(drain) = drain {
                drain.await;
            }
        };
        // Only the stdout side ends the pump; the writer and the drain wait once they are done.
        let run = future::race(
            reading,
            future::race(then_wait(writing), then_wait(draining)),
        );

        StartedSession {
            session: ClaudeSession {
                stdin: stdin_tx,
                session_id: session_id.to_string(),
            },
            events: events_rx,
            pump: SessionPump {
                stage: Stage::Running(Box::pin(run)),
                process,
                stdin: Box::new(stdin_rx),
            },
        }
    }

    fn send(&self, line: String) -> Result<(), SendError> {
        self.stdin.try_send(line).map_err(|_| SendError::Closed)
    }

    // Control-request and message ids are the session's to make; the encoder stays pure.
    fn new_id() -> String {
        uuid::Uuid::new_v4().to_string()
    }
}

async fn then_wait(work: impl Future<Output = ()>) -> PumpEnd {
    work.await;
    future::pending().await
}

async fn read_stdout(
    lines: Option<stream::Boxed<Result<String, ProcessFailure>>>,
    events: Sender<AgentEvent>,
) -> PumpEnd {
    // stdout taken before the session started: nothing can be read.
    let Some(mut lines) = lines else {
        return PumpEnd::Failed(ProcessFailure::Io(io::ErrorKind::Other));
    };
    while let Some(next) = lines.next().await {
        match next {
            // One line, one event, in order: a delta never spans lines and parallel indices
            // never mix.
            Ok(line) => {
                if events.try_send(decode(&line)).is_err() {
                    return PumpEnd::Abandoned;
                }
            }
            Err(failure) => return PumpEnd::Failed(failure),
        }
    }
    PumpEnd::Ended
}

async fn write_stdin(process: Arc<dyn AgentProcess>, queue: Receiver<String>) {
    while let Ok(line) = queue.recv().await {
        if process.write_stdin(line).await.is_err() {
            // A CLI that has ended may still have lines on stdout not read yet (capture 36's
            // result), so a failed write does not stop the read; later sends fail as this did.
            queue.close();
            return;
        }
    }
    // Every handle is gone and the queue is written out: closing stdin asks the CLI to end.
    process.destroy();
}

impl SessionPump {
    fn finish(&self) {
        self.process.destroy();
        self.stdin.close();
    }
}

impl Future for SessionPump {
    type Output = PumpEnd;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<PumpEnd> {
        let this = self.get_mut();
        if let Stage::Running(run) = &mut this.stage {
            let Poll::Ready(end) = run.as_mut().poll(cx) else {
                return Poll::Pending;
            };
            // Dropping the run stops the writer and closes the events.
            this.stage = Stage::Done(end);
            this.finish();
        }
        match &this.stage {
            Stage::Done(end) => Poll::Ready(end.clone()),
            Stage::Running(_) => Poll::Pending,
        }
    }
}

impl Drop for SessionPump {
    fn drop(&mut self) {
        if let Stage::Running(_) = self.stage {
            self.stage = Stage::Done(PumpEnd::Abandoned);
            self.finish();
        }
    }
}

impl AgentSession for ClaudeSession {
    fn send_user_message(
        &self,
        text: &str,
        attachments: &[Attachment],
        uuid: Option<&str>,
    ) -> Result<(), SendError> {
        let uuid = uuid.map_or_else(Self::new_id, str::to_string);
        self.send(encode::user_message(
            &self.session_id,
            &uuid,
            text,
            attachments,
        )?)
    }

    fn respond_to_approval(
        &self,
        decision: &ApprovalDecision,
        payload: Option<&str>,
        updated_permissions: Option<&str>,
    ) -> Result<(), SendError> {
        let line = match decision {
            // All three reply with allow; they differ in the opaque updatedInput only.
            ApprovalDecision::Allow { request_id }
            | ApprovalDecision::Answered { request_id }
            | ApprovalDecision::AfkTimeout { request_id } => {
                encode::allow(request_id, payload.unwrap_or("{}"), updated_permissions)?
            }
            ApprovalDecision::Deny { request_id } => {
                encode::deny(request_id, payload.unwrap_or(""))
            }
        };
        self.send(line)
    }

    // The ids of the requests below are the caller's: it records the request under that id
    // before it writes, so the answer cannot be folded before the request is known.
    fn set_model(&self, model: &str, request_id: &str) -> Result<(), SendError> {
        self.send(encode::set_model(request_id, model))
    }

    fn set_permission_mode(&self, mode: &str, request_id: &str) -> Result<(), SendError> {
        self.send(encode::set_permission_mode(request_id, mode))
    }

    fn request_context_usage(&self, request_id: &str) -> Result<(), SendError> {
        self.send(encode::get_context_usage(request_id, "summary"))
    }

    fn request_settings(&self, request_id: &str) -> Result<(), SendError> {
        self.send(encode::get_settings(request_id))
    }

    fn set_effort(&self, effort: Option<&str>, request_id: &str) -> Result<(), SendError> {
        self.send(encode::apply_effort(request_id, effort))
    }

    fn turn_sandbox_off(&self, request_id: &str) -> Result<(), SendError> {
        self.send(encode::sandbox_off(request_id))
    }

    fn request_mcp_status(&self, request_id: &str) -> Result<(), SendError> {
        self.send(encode::mcp_status(request_id))
    }

    fn set_mcp_server_enabled(
        &self,
        name: &str,
        enabled: bool,
        request_id: &str,
    ) -> Result<(), SendError> {
        self.send(encode::mcp_toggle(request_id, name, enabled))
    }

    fn reconnect_mcp_server(&self, name: &str, request_id: &str) -> Result<(), SendError> {
        self.send(encode::mcp_reconnect(request_id, name))
    }

    fn rewind_files(
        &self,
        user_message_id: &str,
        dry_run: bool,
        request_id: &str,
    ) -> Result<(), SendError> {
        self.send(encode::rewind_files(request_id, user_message_id, dry_run))
    }

    fn interrupt(&self) -> Result<(), SendError> {
        self.send(encode::interrupt(&Self::new_id()))
    }

    fn stop_task(&self, task_id: &str) -> Result<(), SendError> {
        self.send(encode::stop_task(&Self::new_id(), task_id))
    }
}
