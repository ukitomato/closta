//! What a [`FakeAgentSession`](super::session::FakeAgentSession) plays, and what it records.
//! Mirrors FakeScript.kt.
//!
//! No CLI, no process, no clock. An AFK timeout is a host *decision*, not a duration: a
//! [`Beat::AwaitResponse`] holds the stream on an outstanding request until the host answers it,
//! so a test crosses the "waiting" window without spending real or virtual time.

use closta_model::{AgentEvent, ApprovalDecision, Attachment};

use crate::claude::process::ProcessFailure;

/// A scenario for the fake session: the events to stream and how the stream ends.
#[derive(Clone, PartialEq, Debug)]
pub struct FakeScript {
    pub beats: Vec<Beat>,
    pub termination: Termination,
}

impl FakeScript {
    /// Plays `beats`, then ends cleanly.
    pub fn new(beats: Vec<Beat>) -> FakeScript {
        FakeScript {
            beats,
            termination: Termination::Complete,
        }
    }
}

/// One step the fake plays on its event stream.
// Scripts are short test data; a plain event keeps them as easy to write as in Kotlin.
#[allow(clippy::large_enum_variant)]
#[derive(Clone, PartialEq, Debug)]
pub enum Beat {
    /// Puts one event on the stream. The caller builds it from a capture through the one decoder;
    /// the fake never decodes JSON itself.
    Emit(AgentEvent),
    /// Holds the stream until the host answers `request_id` or interrupts: the CLI waiting on an
    /// unanswered request, without any wait.
    AwaitResponse { request_id: String },
}

/// How the fake's event stream ends.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Termination {
    /// The stream ends cleanly after the last beat.
    Complete,
    /// After the beats, the stream fails: a dropped connection or a dead process.
    Error(ProcessFailure),
    /// The stream fails before any beat, as `Io(NotFound)`: a launch that gave no process.
    LaunchFailure,
}

/// A send the host made through the fake session, recorded in order. Only the fake's own tests
/// look at it; the shared contract observes the events and `resolve_approval`.
#[derive(Clone, PartialEq, Debug)]
pub enum Sent {
    UserMessage {
        text: String,
        attachments: Vec<Attachment>,
        uuid: Option<String>,
    },
    Approval {
        decision: ApprovalDecision,
        payload: Option<String>,
        updated_permissions: Option<String>,
    },
    SetModel {
        model: String,
        request_id: String,
    },
    SetPermissionMode {
        mode: String,
        request_id: String,
    },
    RequestContextUsage {
        request_id: String,
    },
    RequestSettings {
        request_id: String,
    },
    SetEffort {
        effort: Option<String>,
        request_id: String,
    },
    TurnSandboxOff {
        request_id: String,
    },
    RequestMcpStatus {
        request_id: String,
    },
    SetMcpServerEnabled {
        name: String,
        enabled: bool,
        request_id: String,
    },
    ReconnectMcpServer {
        name: String,
        request_id: String,
    },
    RewindFiles {
        user_message_id: String,
        dry_run: bool,
        request_id: String,
    },
    Interrupt,
}

/// Beats that stream `events` as they are, to the end: the plain send-then-turn shape.
pub fn beats_emitting(events: &[AgentEvent]) -> Vec<Beat> {
    events.iter().cloned().map(Beat::Emit).collect()
}

/// Beats that stream `events` but hold after each control request until the host answers it,
/// as the CLI does on an unanswered `request_id`.
pub fn beats_awaiting_after_control_requests(events: &[AgentEvent]) -> Vec<Beat> {
    let mut beats = Vec::with_capacity(events.len());
    for event in events {
        beats.push(Beat::Emit(event.clone()));
        if let AgentEvent::ControlRequest { request_id, .. } = event {
            beats.push(Beat::AwaitResponse {
                request_id: request_id.clone(),
            });
        }
    }
    beats
}
