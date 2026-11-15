//! Folds one input into the [`Transcript`] (TranscriptFold.kt).

pub mod paths;
pub mod routing;
pub mod sign_in;
pub mod snapshot;
pub mod stream;

use std::sync::Arc;

use closta_model::{AgentEvent, ConversationState};

use crate::input::{PresenterInput, UserSent};
use crate::keyed::Keyed;
use crate::records::tasks::fold_background;
use crate::transcript::{MessageRecord, MessageSource, PartRecord, Role, TextRecord, Transcript};

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
        PresenterInput::UserSent(sent) => fold_sent(transcript, sent),
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
        AgentEvent::StreamEvent {
            event,
            parent_tool_use_id,
            ..
        } => stream::fold_stream(transcript, event, parent_tool_use_id.as_deref()),
        AgentEvent::Assistant {
            message,
            parent_tool_use_id,
            error,
            ..
        } => {
            let parent = parent_tool_use_id.as_deref();
            sign_in::fold_sign_in(
                &snapshot::fold_assistant(transcript, message, parent),
                parent,
                error.as_deref(),
            )
        }
        AgentEvent::User {
            uuid,
            message,
            parent_tool_use_id,
            tool_use_result,
            ..
        } => snapshot::fold_user(
            transcript,
            message,
            parent_tool_use_id.as_deref(),
            uuid,
            tool_use_result.as_ref(),
        ),
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
        AgentEvent::SystemBackgroundTasksChanged { .. }
        | AgentEvent::SystemTaskProgress { .. }
        | AgentEvent::SystemTaskStarted { .. } => fold_background(transcript, event),
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

/// The user's words exist only here: the CLI does not echo them on stdout.
fn fold_sent(transcript: &Arc<Transcript>, sent: &UserSent) -> Arc<Transcript> {
    let key = transcript.messages.claim(sent.message_id.as_str());
    // The files go ahead of the words, as they do to the CLI; their keys are a letter and a
    // number, the words' is 0.
    let files = sent
        .attachments
        .iter()
        .enumerate()
        .fold(Keyed::new(), |parts, (index, file)| {
            parts.put(
                format!("{key}:a{index}"),
                Arc::new(PartRecord::Attachment(file.clone())),
            )
        });
    let parts = files.put(
        format!("{key}:0"),
        Arc::new(PartRecord::Text(TextRecord {
            reasoning: false,
            text: sent.text.clone(),
            streaming: false,
        })),
    );
    let message = MessageRecord {
        key: key.clone(),
        role: Role::User,
        source: MessageSource::Sent,
        parts,
    };
    let mut routing = transcript.routing.clone();
    routing.sends = routing.sends.wrapping_add(1);
    let user_uuids = match &sent.uuid {
        Some(uuid) => transcript.user_uuids.update(key.clone(), uuid.clone()),
        None => transcript.user_uuids.clone(),
    };
    Arc::new(Transcript {
        messages: transcript.messages.put(key, Arc::new(message)),
        routing,
        user_uuids,
        ..Transcript::clone(transcript)
    })
}
