//! Folds one input into the [`Transcript`] (TranscriptFold.kt).

mod commands;
mod operations;
pub mod paths;
pub mod routing;
pub mod sign_in;
pub mod snapshot;
mod stop;
pub mod stream;
pub mod suggestions;

use std::sync::Arc;

use closta_model::{
    AgentEvent, ApprovalDecision, ApprovalKind, ConversationState, RawJson, TurnPhase,
};
use serde_json::Value;

use crate::fold::commands::{fold_commands_of_init, fold_commands_of_response};
use crate::fold::operations::{fold_operation, with_operations};
use crate::fold::paths::replace_routing;
use crate::fold::stop::{fold_stop, stop_taken};
use crate::fold::suggestions::suggestions_of;
use crate::input::{AnswerFailed, Decided, PresenterInput, UserSent};
use crate::json::parse;
use crate::keyed::{Keyed, of_cli_id};
use crate::records::composer::fold_answered;
use crate::records::history::fold_history;
use crate::records::operations::Answer;
use crate::records::tasks::fold_background;
use crate::records::turn_end::with_turn_end;
use crate::transcript::{
    ApprovalOutcome, ApprovalRecord, MessageRecord, MessageSource, PartRecord, ResumeEnd, Role,
    TextRecord, Transcript,
};

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
        PresenterInput::StopRequested => fold_stop(transcript, after),
        PresenterInput::Decided(decided) => fold_decided(transcript, decided, before),
        PresenterInput::AnswerFailed(failed) => fold_answer_failed(transcript, failed, before),
        PresenterInput::FilesFound(_) | PresenterInput::TurnChangesFound(_) => {
            fold_answered(transcript, input)
        }
        PresenterInput::ControlRequested(_)
        | PresenterInput::ControlSendFailed(_)
        | PresenterInput::EffortRefused(_)
        | PresenterInput::Launched(_)
        | PresenterInput::SandboxRefused(_)
        | PresenterInput::SandboxNotStarted(_)
        | PresenterInput::RewindRequested(_)
        | PresenterInput::RewindNotSent(_)
        | PresenterInput::ResumeRefused(_)
        | PresenterInput::AttachmentRefused(_) => fold_operation(transcript, input),
        PresenterInput::SessionsListed(_)
        | PresenterInput::Restored(_)
        | PresenterInput::HistoryRestored(_)
        | PresenterInput::HistoryUnavailable => {
            fold_history(transcript, input, before, after, fold_event)
        }
    }
}

fn fold_event(
    transcript: &Arc<Transcript>,
    event: &AgentEvent,
    before: &ConversationState,
    after: &ConversationState,
) -> Arc<Transcript> {
    match event {
        AgentEvent::CommandLifecycle {
            command_uuid,
            state,
            ..
        } => fold_lifecycle(transcript, command_uuid, state),
        AgentEvent::Result {
            user_message_uuid,
            duration_ms,
            is_error,
            result,
            model_usage,
            ..
        } => {
            let closed = fold_result(
                transcript,
                &ResultFacts {
                    user_message_uuid: user_message_uuid.as_deref(),
                    duration_ms: *duration_ms,
                    is_error: *is_error,
                    result,
                },
                before,
                after,
            );
            let counted = with_operations(&closed, closed.operations.resulted(model_usage));
            stop_taken(&counted)
        }
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
        AgentEvent::ControlRequest {
            request_id,
            request,
            agent_id,
            tool_name,
            tool_use_id,
        } => fold_request(
            transcript,
            &RequestFacts {
                request_id,
                request,
                agent_id: agent_id.as_deref(),
                tool_name: tool_name.as_deref(),
                tool_use_id: tool_use_id.as_deref(),
            },
            after,
        ),
        AgentEvent::ControlResponse {
            response,
            request_id,
            subtype,
            error,
        } => {
            let answer = Answer {
                request_id: request_id.as_deref(),
                subtype: subtype.as_deref(),
                response,
                error: error.as_deref(),
            };
            let answered = with_operations(transcript, transcript.operations.answered(&answer));
            fold_commands_of_response(&answered, response, subtype.as_deref())
        }
        AgentEvent::SystemCompactBoundary {
            compact_metadata, ..
        } => with_operations(
            transcript,
            transcript.operations.compacted(compact_metadata),
        ),
        AgentEvent::SystemStatus {
            status,
            permission_mode,
            ..
        } => with_operations(
            transcript,
            transcript
                .operations
                .status_said(status.as_deref(), permission_mode.as_deref()),
        ),
        AgentEvent::SystemInit { slash_commands, .. } => {
            fold_commands_of_init(transcript, slash_commands)
        }
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

const STARTED: &str = "started";

/// A turn gets its assistant message at `started`, not at `queued`: a queued command waits behind
/// the one running, and the content that arrives meanwhile belongs to that one.
fn fold_lifecycle(transcript: &Arc<Transcript>, uuid: &str, state: &str) -> Arc<Transcript> {
    let routing = &transcript.routing;
    if state != STARTED || routing.turns.contains_key(uuid) {
        return Arc::clone(transcript);
    }
    let key = transcript.messages.claim(&of_cli_id(uuid));
    let message = MessageRecord {
        key: key.clone(),
        role: Role::Assistant,
        source: MessageSource::Turn {
            command_uuid: uuid.to_owned(),
        },
        parts: Keyed::new(),
    };
    let mut routing = routing.clone();
    routing.turns.insert(uuid.to_owned(), key.clone());
    routing.current_turn = Some(key.clone());
    Arc::new(Transcript {
        messages: transcript.messages.put(key, Arc::new(message)),
        routing,
        ..Transcript::clone(transcript)
    })
}

/// What [`fold_result`] reads of a `result`.
struct ResultFacts<'a> {
    user_message_uuid: Option<&'a str>,
    duration_ms: i64,
    is_error: bool,
    result: &'a str,
}

/// Core counts every `result` that closed no user turn as a spontaneous resume, so an unchanged
/// count says this one closed a turn; the turn's content stops going to its message. Any other
/// `result` ends the spontaneous resume that is open, and its outcome is kept on the message,
/// because core has no turn to keep it on.
fn fold_result(
    transcript: &Arc<Transcript>,
    event: &ResultFacts<'_>,
    before: &ConversationState,
    after: &ConversationState,
) -> Arc<Transcript> {
    let routing = &transcript.routing;
    if after.spontaneous_resume_count == before.spontaneous_resume_count {
        let turn_key = event
            .user_message_uuid
            .and_then(|uuid| routing.turns.get(uuid));
        // The result may close more turns than the one it names (messages run together or taken
        // in); the turn receiving content is one of them when it started last.
        let ended = routing.current_turn.as_ref().is_some_and(|current| {
            after.turns.iter().any(|turn| {
                turn.phase == TurnPhase::Closed
                    && routing.turns.get(&turn.command_uuid) == Some(current)
            })
        });
        let closed = match turn_key {
            Some(key) => with_turn_end(transcript, key, Some(event.duration_ms)),
            None => Arc::clone(transcript),
        };
        if ended {
            let mut routing = closed.routing.clone();
            routing.current_turn = None;
            replace_routing(&closed, routing)
        } else {
            closed
        }
    } else if let Some(open) = &routing.open_resume {
        let end = ResumeEnd {
            is_error: event.is_error,
            result: event.result.to_owned(),
        };
        let messages = transcript.messages.update(open, |message| {
            Arc::new(MessageRecord {
                source: MessageSource::Resume { end: Some(end) },
                ..MessageRecord::clone(message)
            })
        });
        let mut routing = routing.clone();
        routing.open_resume = None;
        Arc::new(Transcript {
            messages,
            routing,
            ..Transcript::clone(transcript)
        })
    } else {
        Arc::clone(transcript)
    }
}

/// What [`fold_request`] reads of a `control_request`.
struct RequestFacts<'a> {
    request_id: &'a str,
    request: &'a RawJson,
    agent_id: Option<&'a str>,
    tool_name: Option<&'a str>,
    tool_use_id: Option<&'a str>,
}

/// Records what the request asks, whatever its `RawJson` holds: core keeps it pending from the
/// typed fields alone, and an approval the tree does not show is one the user cannot answer while
/// the CLI waits for it. A `request_id` that is empty is not recorded — the webview cannot answer
/// it (the protocol requires a non-empty `approvalId`). A repeated `request_id` replaces the
/// record, as the request is asked afresh.
///
/// Whether it is a question is core's kind for the request; when core holds no entry for it, the
/// record keeps what it had. The anchor is the assistant message the request belongs to, so a part
/// made for it stays there.
fn fold_request(
    transcript: &Arc<Transcript>,
    event: &RequestFacts<'_>,
    after: &ConversationState,
) -> Arc<Transcript> {
    if event.request_id.is_empty() {
        return Arc::clone(transcript);
    }
    let existing = transcript.approvals.get(event.request_id);
    let held = after
        .pending_approvals
        .iter()
        .find(|it| it.request_id == event.request_id);
    let routing = &transcript.routing;
    let messages = &transcript.messages;
    let last_assistant = || {
        messages
            .order()
            .rev()
            .find(|key| {
                messages
                    .get(key)
                    .is_some_and(|it| it.role == Role::Assistant)
            })
            .map(str::to_owned)
    };
    let request = match parse(&event.request.0) {
        Some(Value::Object(fields)) => Some(fields),
        _ => None,
    };
    let record = ApprovalRecord {
        request_id: event.request_id.to_owned(),
        tool_use_id: event.tool_use_id.map(str::to_owned),
        tool_name: event.tool_name.map(str::to_owned),
        agent_id: event.agent_id.map(str::to_owned),
        input: request
            .as_ref()
            .and_then(|it| it.get("input"))
            .map(|it| Arc::new(it.clone())),
        unreadable: request.is_none().then(|| event.request.0.clone()),
        ask: held.map_or_else(
            || existing.is_some_and(|it| it.ask),
            |it| it.kind == ApprovalKind::Ask,
        ),
        anchor: routing
            .current_turn
            .clone()
            .or_else(|| routing.open_resume.clone())
            .or_else(last_assistant),
        suggestions: suggestions_of(request.as_ref()),
        ..ApprovalRecord::default()
    };
    if existing.is_some_and(|it| **it == record) {
        return Arc::clone(transcript);
    }
    Arc::new(Transcript {
        approvals: transcript
            .approvals
            .put(event.request_id.to_owned(), Arc::new(record)),
        ..Transcript::clone(transcript)
    })
}

/// An answer counts only for a request core held as pending before it (core's `resolve_approval`
/// ignores any other): one the CLI already stopped waiting on stays as it ended.
fn fold_decided(
    transcript: &Arc<Transcript>,
    input: &Decided,
    before: &ConversationState,
) -> Arc<Transcript> {
    let decision = &input.decision;
    let request_id = decision.request_id();
    let held = before
        .pending_approvals
        .iter()
        .any(|it| it.request_id == request_id);
    let Some(record) = transcript.approvals.get(request_id).filter(|_| held) else {
        return Arc::clone(transcript);
    };
    let outcome = outcome_of(record.ask, decision);
    // What the host passed on is only a fact of an answer the CLI took as an allow; a denial
    // carries neither. An answer clears the failure of an earlier try, and keeps its count.
    let allowed = outcome == ApprovalOutcome::Approved;
    let settled = ApprovalRecord {
        outcome: Some(outcome),
        accepted_suggestions: if allowed {
            Arc::from(input.passed_on.accepted_suggestions.as_slice())
        } else {
            Arc::from([])
        },
        updated_input: if allowed && matches!(decision, ApprovalDecision::Allow { .. }) {
            rewritten_input(record, input)
        } else {
            None
        },
        failure: None,
        ..ApprovalRecord::clone(record)
    };
    if **record == settled {
        return Arc::clone(transcript);
    }
    Arc::new(Transcript {
        approvals: transcript
            .approvals
            .put(record.request_id.clone(), Arc::new(settled)),
        ..Transcript::clone(transcript)
    })
}

/// The input the host sent, when it is not the request's own.
fn rewritten_input(
    record: &ApprovalRecord,
    input: &Decided,
) -> Option<Arc<serde_json::Map<String, Value>>> {
    let own = record.input.as_deref().and_then(Value::as_object);
    input
        .passed_on
        .input
        .as_ref()
        .filter(|sent| own != Some(&***sent))
        .cloned()
}

/// An answer the host could not pass on is recorded on the approval it was for, while the approval
/// is still open (core holds it as pending before this input, as for [`fold_decided`]): one already
/// settled, or cancelled by the CLI, stays as it ended, and one the transcript does not know is
/// nothing to write on.
fn fold_answer_failed(
    transcript: &Arc<Transcript>,
    input: &AnswerFailed,
    before: &ConversationState,
) -> Arc<Transcript> {
    let held = before
        .pending_approvals
        .iter()
        .any(|it| it.request_id == input.approval_id);
    let Some(record) = transcript
        .approvals
        .get(&input.approval_id)
        .filter(|it| it.outcome.is_none() && held)
    else {
        return Arc::clone(transcript);
    };
    let failed = ApprovalRecord {
        failure: Some(input.message.clone()),
        failures: record.failures.wrapping_add(1),
        ..ApprovalRecord::clone(record)
    };
    Arc::new(Transcript {
        approvals: transcript
            .approvals
            .put(record.request_id.clone(), Arc::new(failed)),
        ..Transcript::clone(transcript)
    })
}

/// The meaning of the host's answer. An `Allow` without answers leaves a question unanswered,
/// however long the host held it: the CLI settles it as "did not answer" at once, and only
/// `updatedInput.answers` (Answered) or `afkTimeoutMs` (AfkTimeout) say otherwise.
pub(crate) fn outcome_of(ask: bool, decision: &ApprovalDecision) -> ApprovalOutcome {
    match decision {
        ApprovalDecision::Answered { .. } => ApprovalOutcome::Approved,
        ApprovalDecision::Deny { .. } => ApprovalOutcome::Denied,
        ApprovalDecision::AfkTimeout { .. } => ApprovalOutcome::Expired,
        ApprovalDecision::Allow { .. } if ask => ApprovalOutcome::Cancelled,
        ApprovalDecision::Allow { .. } => ApprovalOutcome::Approved,
    }
}
