//! The lines about the session itself rather than its content (SessionLineFold.kt): a reset or a
//! compaction divides the thread, a refusal marks the call it refused and an informational line
//! adds a note. A divider or a note goes in the message receiving content, or in one of its own
//! ([`with_part`]).

use std::sync::Arc;

use closta_model::AgentEvent;
use serde_json::Value;

use crate::fold::operations::with_operations;
use crate::fold::paths::mark_denied;
use crate::json::{JsonFields, parse};
use crate::keyed::{Keyed, of_cli_id};
use crate::records::readings::UNKNOWN_TRIGGER;
use crate::transcript::{
    ClearedRecord, CompactedRecord, Denial, InformationalRecord, MessageRecord, MessageSource,
    PartRecord, Role, Transcript,
};

const CLEARED_PART: &str = "cleared";
const COMPACTED_PART: &str = "compacted";
const COMPACT_SUCCESS: &str = "success";
const NOTICE_PART: &str = "notice";
const INFO_LEVEL: &str = "info";

/// The CLI refused the call `tool_use_id` on its own: its line says so, now or when it is made.
pub(crate) fn fold_denied(
    transcript: &Arc<Transcript>,
    tool_use_id: &str,
    decision_reason_type: Option<&str>,
    decision_reason: Option<&str>,
) -> Arc<Transcript> {
    mark_denied(
        transcript,
        &of_cli_id(tool_use_id),
        Denial {
            reason_type: decision_reason_type.map(str::to_owned),
            reason: decision_reason.map(str::to_owned),
        },
    )
}

/// A line of level `info` is for the CLI's transcript mode and is not shown; any level this
/// version does not know is shown as a notice.
pub(crate) fn fold_informational(
    transcript: &Arc<Transcript>,
    uuid: &str,
    level: &str,
    content: &str,
    prevent_continuation: Option<bool>,
) -> Arc<Transcript> {
    if level == INFO_LEVEL {
        return Arc::clone(transcript);
    }
    with_part(transcript, uuid, NOTICE_PART, |key| {
        PartRecord::Informational(InformationalRecord {
            key,
            level: level.to_owned(),
            content: content.to_owned(),
            stopped: prevent_continuation == Some(true),
        })
    })
    .0
}

/// A reset divides the thread in the message receiving content (the `/clear`'s own turn), or in
/// one of its own when none is, whatever its trigger says: the CLI asks its consumers to reset on
/// every one. What came before stays.
pub(crate) fn fold_reset(
    transcript: &Arc<Transcript>,
    uuid: &str,
    timestamp: Option<&str>,
) -> Arc<Transcript> {
    let (placed, message_key) = with_part(transcript, uuid, CLEARED_PART, |key| {
        PartRecord::Cleared(ClearedRecord {
            key,
            at: timestamp.map(str::to_owned),
        })
    });
    let cleared_at = placed.messages.order().position(|it| it == message_key);
    Arc::new(Transcript {
        cleared_at,
        compact_failure: None,
        ..Transcript::clone(&placed)
    })
}

/// What a compaction's lines do: the status says whether it runs and how it ended, the boundary
/// divides the thread. The console keeps its own record of each ([`OperationRecords`]).
///
/// [`OperationRecords`]: crate::records::operations::OperationRecords
pub(crate) fn fold_compaction(transcript: &Arc<Transcript>, event: &AgentEvent) -> Arc<Transcript> {
    match event {
        AgentEvent::SystemCompactBoundary {
            uuid,
            compact_metadata,
            ..
        } => {
            let divided = fold_compact_boundary(transcript, uuid, &compact_metadata.0);
            let operations = divided.operations.compacted(compact_metadata);
            with_operations(&divided, operations)
        }
        AgentEvent::SystemStatus {
            uuid,
            status,
            permission_mode,
            compact_result,
            ..
        } => {
            let said = compact_status_said(transcript, uuid, compact_result.as_deref());
            let operations = said
                .operations
                .status_said(status.as_deref(), permission_mode.as_deref());
            with_operations(&said, operations)
        }
        _ => Arc::clone(transcript),
    }
}

/// The divider a `compact_boundary` makes, failed when a status said the compaction did not
/// succeed. A boundary that does not say how many tokens it began with makes none.
fn fold_compact_boundary(
    transcript: &Arc<Transcript>,
    uuid: &str,
    metadata: &str,
) -> Arc<Transcript> {
    let metadata = parse(metadata);
    let Some(metadata) = metadata.as_ref().and_then(Value::as_object) else {
        return Arc::clone(transcript);
    };
    let Some(pre_tokens) = metadata.count("pre_tokens") else {
        return Arc::clone(transcript);
    };
    let failed = transcript.compact_failure.is_some();
    let (placed, _) = with_part(transcript, uuid, COMPACTED_PART, |key| {
        PartRecord::Compacted(CompactedRecord {
            key,
            trigger: metadata
                .string("trigger")
                .unwrap_or(UNKNOWN_TRIGGER)
                .to_owned(),
            pre_tokens,
            post_tokens: metadata.count("post_tokens"),
            failed,
        })
    });
    Arc::new(Transcript {
        compact_failure: None,
        ..Transcript::clone(&placed)
    })
}

/// A status that says the compaction did not succeed; none says nothing and a success clears
/// nothing.
fn compact_status_said(
    transcript: &Arc<Transcript>,
    uuid: &str,
    compact_result: Option<&str>,
) -> Arc<Transcript> {
    match compact_result {
        None | Some(COMPACT_SUCCESS) => Arc::clone(transcript),
        Some(_) => Arc::new(Transcript {
            compact_failure: Some(uuid.to_owned()),
            ..Transcript::clone(transcript)
        }),
    }
}

/// At a `result`, a failure no boundary followed is shown now, in the answer of the turn that ran
/// it.
pub(crate) fn compact_failure_shown(transcript: &Arc<Transcript>) -> Arc<Transcript> {
    let Some(uuid) = transcript.compact_failure.as_deref() else {
        return Arc::clone(transcript);
    };
    let (placed, _) = with_part(transcript, uuid, COMPACTED_PART, |key| {
        PartRecord::Compacted(CompactedRecord {
            key,
            trigger: UNKNOWN_TRIGGER.to_owned(),
            pre_tokens: 0,
            post_tokens: None,
            failed: true,
        })
    });
    Arc::new(Transcript {
        compact_failure: None,
        ..Transcript::clone(&placed)
    })
}

/// Puts a part made by `make` in the message receiving content (the turn's, else the open
/// spontaneous resume's), or in one of its own named for `uuid` when none is; and gives that
/// message's key. The part is named `name`, numbered when the message has one by that name.
pub(crate) fn with_part(
    transcript: &Arc<Transcript>,
    uuid: &str,
    name: &str,
    make: impl FnOnce(String) -> PartRecord,
) -> (Arc<Transcript>, String) {
    let routing = &transcript.routing;
    let held = routing
        .current_turn
        .as_ref()
        .or(routing.open_resume.as_ref())
        .filter(|it| transcript.messages.contains(it));
    let message_key =
        held.map_or_else(|| transcript.messages.claim(&of_cli_id(uuid)), Clone::clone);
    let message = transcript.messages.get(&message_key).map_or_else(
        || MessageRecord {
            key: message_key.clone(),
            role: Role::Assistant,
            source: MessageSource::Nested,
            parts: Keyed::new(),
        },
        |it| MessageRecord::clone(it),
    );
    let part_key = message.parts.claim(name);
    let placed = MessageRecord {
        parts: message
            .parts
            .put(part_key.clone(), Arc::new(make(part_key))),
        ..message
    };
    let transcript = Arc::new(Transcript {
        messages: transcript
            .messages
            .put(message_key.clone(), Arc::new(placed)),
        ..Transcript::clone(transcript)
    });
    (transcript, message_key)
}
