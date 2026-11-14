//! Folds one input into the [`Transcript`] (TranscriptFold.kt).

use std::sync::Arc;

use closta_model::{AgentEvent, ConversationState};

use crate::input::PresenterInput;
use crate::transcript::Transcript;

/// Folds one input into the [`Transcript`]. A pure function that never panics: an event it has
/// no use for, or whose `RawJson` it cannot read, returns the transcript unchanged — the same
/// `Arc`, so nothing above it looks changed either.
///
/// `before` and `after` are core's state around the caller's fold of the same input (`fold` for an
/// event, `resolve_approval` for a decision); this fold never calls core. Where content goes
/// sometimes depends on what core decided — whether a `result` closed a user turn, whether a
/// request is a question — and reading core's decision rather than repeating its rule keeps the two
/// from drifting apart.
pub fn fold_transcript(
    transcript: &Arc<Transcript>,
    input: &PresenterInput,
    before: &ConversationState,
    after: &ConversationState,
) -> Arc<Transcript> {
    match input {
        PresenterInput::Event(event) => fold_event(transcript, event, before, after),
        // foldSent
        PresenterInput::UserSent(_) => Arc::clone(transcript),
        // foldStop
        PresenterInput::StopRequested => Arc::clone(transcript),
        // foldDecided
        PresenterInput::Decided(_) => Arc::clone(transcript),
        // foldAnswerFailed
        PresenterInput::AnswerFailed(_) => Arc::clone(transcript),
        // foldAnswered
        PresenterInput::FilesFound(_) | PresenterInput::TurnChangesFound(_) => {
            Arc::clone(transcript)
        }
        // foldOperation
        PresenterInput::ControlRequested(_)
        | PresenterInput::ControlSendFailed(_)
        | PresenterInput::EffortRefused(_)
        | PresenterInput::Launched(_)
        | PresenterInput::SandboxRefused(_)
        | PresenterInput::SandboxNotStarted(_)
        | PresenterInput::RewindRequested(_)
        | PresenterInput::RewindNotSent(_)
        | PresenterInput::ResumeRefused(_)
        | PresenterInput::AttachmentRefused(_) => Arc::clone(transcript),
        // foldHistory
        PresenterInput::SessionsListed(_)
        | PresenterInput::Restored(_)
        | PresenterInput::HistoryRestored(_)
        | PresenterInput::HistoryUnavailable => Arc::clone(transcript),
    }
}

#[expect(
    unused_variables,
    reason = "core's state is read by foldResult and foldRequest, which fill their arms later"
)]
fn fold_event(
    transcript: &Arc<Transcript>,
    event: &AgentEvent,
    before: &ConversationState,
    after: &ConversationState,
) -> Arc<Transcript> {
    match event {
        // foldLifecycle
        AgentEvent::CommandLifecycle { .. } => Arc::clone(transcript),
        // foldResult, then OperationRecords.resulted and stopTaken
        AgentEvent::Result { .. } => Arc::clone(transcript),
        // foldStream
        AgentEvent::StreamEvent { .. } => Arc::clone(transcript),
        // foldAssistant, then foldSignIn
        AgentEvent::Assistant { .. } => Arc::clone(transcript),
        // foldUser
        AgentEvent::User { .. } => Arc::clone(transcript),
        // foldRequest
        AgentEvent::ControlRequest { .. } => Arc::clone(transcript),
        // OperationRecords.answered, then foldCommandsOfResponse
        AgentEvent::ControlResponse { .. } => Arc::clone(transcript),
        // OperationRecords.compacted
        AgentEvent::SystemCompactBoundary { .. } => Arc::clone(transcript),
        // OperationRecords.statusSaid
        AgentEvent::SystemStatus { .. } => Arc::clone(transcript),
        // foldCommandsOfInit
        AgentEvent::SystemInit { .. } => Arc::clone(transcript),
        // foldBackground
        AgentEvent::SystemBackgroundTasksChanged { .. }
        | AgentEvent::SystemTaskProgress { .. }
        | AgentEvent::SystemTaskStarted { .. } => Arc::clone(transcript),
        // The rest carry no content: what they mean for the domain is core's to fold.
        AgentEvent::RateLimitEvent { .. }
        | AgentEvent::SystemThinkingTokens { .. }
        | AgentEvent::SystemTaskUpdated { .. }
        | AgentEvent::SystemTaskNotification { .. }
        | AgentEvent::SystemCommandsChanged { .. }
        | AgentEvent::UnknownKind { .. }
        | AgentEvent::BrokenLine { .. } => Arc::clone(transcript),
    }
}
