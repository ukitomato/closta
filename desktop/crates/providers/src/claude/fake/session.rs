//! An [`AgentSession`] played from a [`FakeScript`] instead of a `claude` CLI.
//! Mirrors FakeAgentSession.kt.
//!
//! The approval round trip, the interrupt and the AFK timeout are measured without a process
//! and without a clock. Each [`Beat::AwaitResponse`] holds the stream on a gate made up front,
//! so an answer opens it whether it comes before or after the stream reaches the wait.

use std::collections::HashMap;
use std::io;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use async_channel::{Receiver, Sender};
use closta_core::ports::{AgentSession, SendError};
use closta_model::{AgentEvent, ApprovalDecision, Attachment};
use futures_lite::future;

use crate::claude::fake::script::{Beat, FakeScript, Sent, Termination};
use crate::claude::process::ProcessFailure;
use crate::claude::session::PumpEnd;

#[derive(Default)]
struct Recorded {
    sent: Vec<Sent>,
    stopped_tasks: Vec<String>,
}

/// What the fake session was sent, also after the session is gone.
#[derive(Clone)]
pub struct FakeRecord {
    recorded: Arc<Mutex<Recorded>>,
}

impl FakeRecord {
    fn lock(&self) -> MutexGuard<'_, Recorded> {
        self.recorded.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The sends the host made, in order.
    pub fn sent(&self) -> Vec<Sent> {
        self.lock().sent.clone()
    }

    /// The task ids the host asked to stop, in order. A stop never lets the stream go on; only
    /// an interrupt does.
    pub fn stopped_tasks(&self) -> Vec<String> {
        self.lock().stopped_tasks.clone()
    }
}

/// Plays a [`FakeScript`] on its events and records what it is sent. Sends never fail.
pub struct FakeAgentSession {
    record: FakeRecord,
    // Closing a gate opens it, for good.
    responses: HashMap<String, Sender<()>>,
    interrupted: Sender<()>,
}

/// One gate: the pump waits on the receiver until the sender is closed.
fn gate() -> (Sender<()>, Receiver<()>) {
    async_channel::bounded(1)
}

impl FakeAgentSession {
    /// The handle, the events and the pump that plays `script`. Nothing is played until the pump
    /// is polled.
    pub fn start(
        script: FakeScript,
    ) -> (
        FakeAgentSession,
        Receiver<AgentEvent>,
        future::Boxed<PumpEnd>,
    ) {
        // One gate per request id, made up front.
        let mut gates = HashMap::new();
        for beat in &script.beats {
            if let Beat::AwaitResponse { request_id } = beat {
                gates.entry(request_id.clone()).or_insert_with(gate);
            }
        }
        let interrupt = gate();
        let session = FakeAgentSession {
            record: FakeRecord {
                recorded: Arc::default(),
            },
            responses: gates
                .iter()
                .map(|(request_id, (open, _))| (request_id.clone(), open.clone()))
                .collect(),
            interrupted: interrupt.0.clone(),
        };
        let (events_tx, events_rx) = async_channel::unbounded();
        let pump = Box::pin(play(script, gates, interrupt, events_tx));
        (session, events_rx, pump)
    }

    /// What this session has been sent; it stays readable after the session is dropped.
    pub fn record(&self) -> FakeRecord {
        self.record.clone()
    }

    fn push(&self, sent: Sent) -> Result<(), SendError> {
        self.record.lock().sent.push(sent);
        Ok(())
    }
}

// The pump holds a sender of every gate too, so that dropping the handle does not open them: as
// in Kotlin, only an answer or an interrupt lets a wait go.
async fn play(
    script: FakeScript,
    gates: HashMap<String, (Sender<()>, Receiver<()>)>,
    interrupt: (Sender<()>, Receiver<()>),
    events: Sender<AgentEvent>,
) -> PumpEnd {
    if script.termination == Termination::LaunchFailure {
        return PumpEnd::Failed(ProcessFailure::Io(io::ErrorKind::NotFound));
    }
    for beat in script.beats {
        match beat {
            Beat::Emit(event) => {
                if events.try_send(event).is_err() {
                    return PumpEnd::Abandoned;
                }
            }
            // Each wait ends with an error once its gate, or the interrupt's, is closed.
            Beat::AwaitResponse { request_id } => {
                let response = gates[&request_id].1.recv();
                _ = future::or(response, interrupt.1.recv()).await;
            }
        }
    }
    match script.termination {
        Termination::Error(failure) => PumpEnd::Failed(failure),
        Termination::Complete | Termination::LaunchFailure => PumpEnd::Ended,
    }
}

impl AgentSession for FakeAgentSession {
    fn send_user_message(
        &self,
        text: &str,
        attachments: &[Attachment],
        uuid: Option<&str>,
    ) -> Result<(), SendError> {
        self.push(Sent::UserMessage {
            text: text.to_string(),
            attachments: attachments.to_vec(),
            uuid: uuid.map(str::to_string),
        })
    }

    fn respond_to_approval(
        &self,
        decision: &ApprovalDecision,
        payload: Option<&str>,
        updated_permissions: Option<&str>,
    ) -> Result<(), SendError> {
        self.push(Sent::Approval {
            decision: decision.clone(),
            payload: payload.map(str::to_string),
            updated_permissions: updated_permissions.map(str::to_string),
        })?;
        if let Some(open) = self.responses.get(decision.request_id()) {
            open.close();
        }
        Ok(())
    }

    fn set_model(&self, model: &str, request_id: &str) -> Result<(), SendError> {
        self.push(Sent::SetModel {
            model: model.to_string(),
            request_id: request_id.to_string(),
        })
    }

    fn set_permission_mode(&self, mode: &str, request_id: &str) -> Result<(), SendError> {
        self.push(Sent::SetPermissionMode {
            mode: mode.to_string(),
            request_id: request_id.to_string(),
        })
    }

    fn request_context_usage(&self, request_id: &str) -> Result<(), SendError> {
        self.push(Sent::RequestContextUsage {
            request_id: request_id.to_string(),
        })
    }

    fn request_settings(&self, request_id: &str) -> Result<(), SendError> {
        self.push(Sent::RequestSettings {
            request_id: request_id.to_string(),
        })
    }

    fn set_effort(&self, effort: Option<&str>, request_id: &str) -> Result<(), SendError> {
        self.push(Sent::SetEffort {
            effort: effort.map(str::to_string),
            request_id: request_id.to_string(),
        })
    }

    fn turn_sandbox_off(&self, request_id: &str) -> Result<(), SendError> {
        self.push(Sent::TurnSandboxOff {
            request_id: request_id.to_string(),
        })
    }

    fn request_mcp_status(&self, request_id: &str) -> Result<(), SendError> {
        self.push(Sent::RequestMcpStatus {
            request_id: request_id.to_string(),
        })
    }

    fn set_mcp_server_enabled(
        &self,
        name: &str,
        enabled: bool,
        request_id: &str,
    ) -> Result<(), SendError> {
        self.push(Sent::SetMcpServerEnabled {
            name: name.to_string(),
            enabled,
            request_id: request_id.to_string(),
        })
    }

    fn reconnect_mcp_server(&self, name: &str, request_id: &str) -> Result<(), SendError> {
        self.push(Sent::ReconnectMcpServer {
            name: name.to_string(),
            request_id: request_id.to_string(),
        })
    }

    fn rewind_files(
        &self,
        user_message_id: &str,
        dry_run: bool,
        request_id: &str,
    ) -> Result<(), SendError> {
        self.push(Sent::RewindFiles {
            user_message_id: user_message_id.to_string(),
            dry_run,
            request_id: request_id.to_string(),
        })
    }

    fn interrupt(&self) -> Result<(), SendError> {
        self.push(Sent::Interrupt)?;
        self.interrupted.close();
        Ok(())
    }

    fn stop_task(&self, task_id: &str) -> Result<(), SendError> {
        self.record.lock().stopped_tasks.push(task_id.to_string());
        Ok(())
    }
}
