//! What the detail pane shows for a session (SessionDetail.kt).

use std::sync::Arc;

use closta_model::ConversationState;

use crate::cards::plan::plan_go_of;
use crate::cards::{ThreadCard, card_of};
use crate::records::turn_end::TurnChangesRecord;
use crate::text::{kt_is_blank, kt_lines, kt_trim};
use crate::thread_running::thread_is_running;
use crate::tool_line::{ToolLine, tool_line};
use crate::transcript::{MessageRecord, PartRecord, Role, Transcript};

use super::groups::waiting_approvals;

/// What the detail pane shows for a session.
#[derive(Clone, PartialEq, Debug)]
pub enum SessionDetail {
    /// The first waiting card, and how many more wait behind it.
    Waiting { card: ThreadCard, more: usize },
    /// The tool it runs now and only the head of its last reply: once the head is filled, more
    /// streamed text leaves this equal, so the pane is not drawn again for every token.
    Running {
        tool: Option<ToolLine>,
        reply_head: Option<String>,
    },
    /// `ask_key` is the last user message (for the turn's changes); `changes` what its turn
    /// changed, if found.
    Finished {
        last_reply: Option<String>,
        ask_key: Option<String>,
        changes: Option<TurnChangesRecord>,
    },
    /// Nothing asked yet.
    Fresh,
}

pub fn session_detail(conversation: &ConversationState, transcript: &Transcript) -> SessionDetail {
    let waiting = waiting_approvals(conversation, transcript);
    if let Some(first) = waiting.first() {
        return SessionDetail::Waiting {
            card: card_of(first, plan_go_of(&transcript.operations)),
            more: waiting.len() - 1,
        };
    }
    if thread_is_running(conversation, transcript) {
        return SessionDetail::Running {
            tool: running_tool(transcript),
            reply_head: reply_head(last_reply_text(transcript).as_deref()),
        };
    }
    let ask_key = last_of(transcript, Role::User).map(|(key, _)| key.to_owned());
    match ask_key {
        None => SessionDetail::Fresh,
        Some(ask_key) => SessionDetail::Finished {
            last_reply: last_reply_text(transcript),
            changes: transcript.turn_changes.get(&ask_key).cloned(),
            ask_key: Some(ask_key),
        },
    }
}

fn running_tool(transcript: &Transcript) -> Option<ToolLine> {
    last_of(transcript, Role::Assistant)?
        .1
        .parts
        .values()
        .filter_map(|part| match &**part {
            PartRecord::ToolCall(call) => Some(call),
            _ => None,
        })
        .filter(|call| call.result.is_none())
        .last()
        .map(tool_line)
}

/// How many lines of the last reply a running session shows.
const REPLY_HEAD_LINES: usize = 3;

/// The first `REPLY_HEAD_LINES` non-blank lines of `reply`, with an ellipsis when more follow;
/// `None` when none.
pub fn reply_head(reply: Option<&str>) -> Option<String> {
    let lines: Vec<&str> = kt_lines(reply?).filter(|it| !kt_is_blank(it)).collect();
    if lines.is_empty() {
        return None;
    }
    let head = lines[..lines.len().min(REPLY_HEAD_LINES)].join("\n");
    Some(if lines.len() > REPLY_HEAD_LINES {
        format!("{head}…")
    } else {
        head
    })
}

/// The text (not reasoning) of the last assistant message, trimmed; `None` when none.
pub fn last_reply_text(transcript: &Transcript) -> Option<String> {
    let texts: Vec<&str> = last_of(transcript, Role::Assistant)?
        .1
        .parts
        .values()
        .filter_map(|part| match &**part {
            PartRecord::Text(text) if !text.reasoning => Some(text.text.as_str()),
            _ => None,
        })
        .collect();
    let reply = kt_trim(&texts.join("\n\n")).to_owned();
    (!reply.is_empty()).then_some(reply)
}

/// The key of the last message of `role`, and the message.
fn last_of(transcript: &Transcript, role: Role) -> Option<(&str, &Arc<MessageRecord>)> {
    transcript.messages.order().rev().find_map(|key| {
        let message = transcript.messages.get(key)?;
        (message.role == role).then_some((key, message))
    })
}
