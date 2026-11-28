//! What one thread has shown so far (Transcript.kt).
//!
//! The content core deliberately does not keep: the user's words, the model's text and thinking,
//! tool arguments and results, sub-agent conversations, and what each approval asks. It is read
//! out of the events' `RawJson` by [`fold_transcript`](crate::fold::fold_transcript).
//!
//! It holds no domain fact core owns. Whether a turn is open or closed, which approvals are
//! pending and how a task ended are read from `ConversationState` when the tree is projected, so
//! the two never disagree; what is kept here about turns is only where content goes ([`Routing`]).
//!
//! Every record is immutable and an update copies only the path it touches: a message, part or
//! approval that an input did not touch is the same `Arc` afterwards. Every table that grows with
//! the conversation is persistent (`imbl`) or behind an `Arc`, so a copy of a [`Transcript`] costs
//! the same however long the conversation is.

use std::fmt;
use std::sync::Arc;

use imbl::{HashMap, HashSet};
use serde_json::{Map, Value};

use crate::keyed::Keyed;
use crate::records::attachment::AttachmentRecord;
use crate::records::composer::{FileSearchRecord, SlashCommands};
use crate::records::history::{RestoredRecord, SavedSessionRecord};
use crate::records::operations::OperationRecords;
use crate::records::tasks::BackgroundTasks;
use crate::records::turn_end::{TurnChangesRecord, TurnEndRecord};

#[derive(Clone, PartialEq, Debug, Default)]
pub struct Transcript {
    /// The thread's messages in order: the user's, one per turn, one per spontaneous resume.
    pub messages: Keyed<MessageRecord>,
    /// Every approval and question the CLI asked, by `request_id`, in arrival order.
    pub approvals: Keyed<ApprovalRecord>,
    pub routing: Routing,
    /// The slash commands the CLI has.
    pub commands: SlashCommands,
    /// The answer to the webview's last file query, by that command's id; only the last one is kept.
    pub file_search: Option<FileSearchRecord>,
    /// What the operations console shows that core does not keep.
    pub operations: Arc<OperationRecords>,
    /// The CLI's uuid of each user message of this thread, by the message's key; the tree does not
    /// carry it.
    pub user_uuids: HashMap<String, String>,
    /// The project's saved sessions as the host last listed them; `None` until it has listed.
    pub saved_sessions: Option<Arc<[SavedSessionRecord]>>,
    /// Whether the last listing could not be read; `saved_sessions` is then the one before it.
    pub saved_sessions_unreadable: bool,
    /// What was put back of an earlier conversation when the session was resumed; `None` when
    /// nothing was.
    pub restored: Option<RestoredRecord>,
    /// Whether the session was resumed and its record could not be read.
    pub history_unavailable: bool,
    /// What runs in the background, as the CLI last listed it (the running list).
    pub background: BackgroundTasks,
    /// How each turn a `result` closed ended, by the key of the turn's message.
    pub turn_ends: HashMap<String, TurnEndRecord>,
    /// What the host found each turn changed, by the key of the user message the turn answered.
    pub turn_changes: HashMap<String, TurnChangesRecord>,
    /// The key of the message whose reply said the CLI is not signed in, until the model's next
    /// reply.
    pub sign_in: Option<String>,
    /// The uuid of the `system/status` that said the last compaction did not succeed, until a
    /// boundary, a `result` or a reset uses it up.
    pub compact_failure: Option<String>,
    /// The keys of the user messages the session refused to send.
    pub not_sent: imbl::HashSet<String>,
    /// Where the conversation was last cleared: the place in `messages` of the message holding the
    /// last [`ClearedRecord`], `None` while it never was. What comes before it belongs to a
    /// conversation the CLI no longer has.
    pub cleared_at: Option<usize>,
    /// Where the conversation was last cleared by `/clear` (a reset whose trigger is `clear`):
    /// the session is named by the first request after it. `None` while none was; a reset of
    /// another trigger (leaving plan mode with a clear context) leaves it.
    pub cleared_by_clear_at: Option<usize>,
    /// Refusals whose call has no line yet, by the call's key; each is put on its line when the
    /// line is made.
    pub denials: HashMap<String, Denial>,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Role {
    User,
    Assistant,
}

impl Role {
    pub fn wire(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }
}

#[derive(Clone, PartialEq, Debug)]
pub struct MessageRecord {
    pub key: String,
    pub role: Role,
    pub source: MessageSource,
    pub parts: Keyed<PartRecord>,
}

/// Where a message came from, which decides where its status is read.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum MessageSource {
    /// The host's own user message. It has no status.
    Sent,
    /// The assistant's reply in the turn the user started with `command_uuid`; core's turn gives
    /// its status.
    Turn { command_uuid: String },
    /// What the CLI said on its own after a background task finished. Core keeps no turn for it,
    /// so the transcript records the `result` that closed it; `end` is `None` while it is open.
    Resume { end: Option<ResumeEnd> },
    /// A sub-agent's message, nested under the tool call that started the sub-agent. It has no
    /// status.
    Nested,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ResumeEnd {
    pub is_error: bool,
    pub result: String,
}

/// One part of a message.
#[derive(Clone, PartialEq, Debug)]
pub enum PartRecord {
    Text(TextRecord),
    ToolCall(ToolCallRecord),
    Other(OtherRecord),
    Attachment(AttachmentRecord),
    Cleared(ClearedRecord),
    Compacted(CompactedRecord),
    Informational(InformationalRecord),
}

/// A compaction as the thread shows it (`system/compact_boundary`): what started it (`unknown`
/// when the CLI did not say), the tokens before and, when the CLI said, after. `failed` when a
/// status said it did not succeed; one no boundary followed has no tokens (`pre_tokens` 0).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct CompactedRecord {
    pub key: String,
    pub trigger: String,
    pub pre_tokens: i64,
    pub post_tokens: Option<i64>,
    pub failed: bool,
}

/// A line the CLI would print in its own terminal (`system/informational`), of a `level` other
/// than `info`. `stopped` is true when the CLI stopped going on after it. `Debug` shows the level
/// and the length of `content`, never its words.
#[derive(Clone, PartialEq, Eq)]
pub struct InformationalRecord {
    pub key: String,
    pub level: String,
    pub content: String,
    pub stopped: bool,
}

impl fmt::Debug for InformationalRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "InformationalRecord({}, {} bytes{})",
            self.level,
            self.content.len(),
            if self.stopped { ", stopped" } else { "" }
        )
    }
}

/// Why the CLI refused a call on its own: the kind of decision (`mode`, `rule`, `classifier`...)
/// and its own words, each when it gave them. `Debug` shows the kind and the length of `reason`,
/// never its words.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct Denial {
    pub reason_type: Option<String>,
    pub reason: Option<String>,
}

impl fmt::Debug for Denial {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Denial({}, ",
            self.reason_type.as_deref().unwrap_or("no kind")
        )?;
        match &self.reason {
            Some(reason) => write!(f, "reason of {} bytes)", reason.len()),
            None => write!(f, "no reason)"),
        }
    }
}

/// Where the CLI discarded the conversation (`conversation_reset`): what came before stays shown,
/// above it. `key` is its part key; `at` is when it happened as the CLI wrote it (ISO 8601, UTC),
/// `None` when the line did not say. `Debug` shows the time alone.
#[derive(Clone, PartialEq, Eq)]
pub struct ClearedRecord {
    pub key: String,
    pub at: Option<String>,
}

impl fmt::Debug for ClearedRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "ClearedRecord({})",
            self.at.as_deref().unwrap_or("no time")
        )
    }
}

/// A text or thinking block. `streaming` is true from the stream's `content_block_start` until its
/// `content_block_stop`; a block that arrived only as a finished snapshot never streamed.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct TextRecord {
    pub reasoning: bool,
    pub text: String,
    pub streaming: bool,
}

/// A tool call, keyed in its message by [`of_cli_id`](crate::keyed::of_cli_id) of `tool_use_id`.
/// `args_text` is the input as it streamed in; `input` is the finished input from the `assistant`
/// snapshot, kept as the CLI sent it — whether it can go into the tree is decided when the tree is
/// built, where its depth is known. `streaming` is true from the stream's `content_block_start`
/// until its `content_block_stop`, while `args_text` is still growing.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct ToolCallRecord {
    pub tool_use_id: String,
    pub tool_name: String,
    pub args_text: String,
    pub input: Option<Arc<Value>>,
    pub result: Option<ToolResult>,
    /// A sub-agent's conversation, when this call started one.
    pub messages: Keyed<MessageRecord>,
    pub streaming: bool,
    /// Set when the CLI refused this call on its own (`permission_denied`), without asking.
    pub denied: Option<Denial>,
}

/// The `tool_result` for a call. `content` is `None` when the block carried none. `duration_ms`
/// is how long a sub-agent ran, when the line's `tool_use_result` says so.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct ToolResult {
    pub content: Option<Arc<Value>>,
    pub is_error: Option<bool>,
    pub duration_ms: Option<i64>,
}

/// A block of a type this version does not know; the tree shows it as a part of that type.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct OtherRecord {
    pub r#type: String,
}

/// One `control_request`. Only what the projection shows is kept: which tool call it gates, what
/// it asks, and what the host answered — the answer arrives on stdin, so core does not keep it.
///
/// The request's input, the rewritten input and the unreadable request are what the user and the
/// CLI said: `Debug` leaves them out.
#[derive(Clone, PartialEq, Default)]
pub struct ApprovalRecord {
    pub request_id: String,
    pub tool_use_id: Option<String>,
    pub tool_name: Option<String>,
    pub agent_id: Option<String>,
    /// The request's `input`: what a question asks, and the input of a part made when no tool call
    /// carries it.
    pub input: Option<Arc<Value>>,
    /// The request as the CLI sent it, when it is not a JSON object: still shown, as the only
    /// account of the call.
    pub unreadable: Option<String>,
    /// Whether core holds the request as a question (its kind is `Ask`).
    pub ask: bool,
    /// The top-level assistant message receiving content (else the last one) when the request
    /// arrived.
    pub anchor: Option<String>,
    pub outcome: Option<ApprovalOutcome>,
    /// What the CLI offered to remember along with an allow, from the request's
    /// `permission_suggestions`.
    pub suggestions: Arc<[SuggestionRecord]>,
    /// The ids of the suggestions the host passed on to the CLI with its allow; empty when none was.
    pub accepted_suggestions: Arc<[String]>,
    /// The input the host sent with its allow, when that is not the request's own: a rewrite.
    pub updated_input: Option<Arc<Map<String, Value>>>,
    /// The host's sentence for the last answer it could not pass on; cleared by the next answer
    /// that was sent.
    pub failure: Option<String>,
    /// How many answers could not be passed on; only grows, so a repeated failure is still a
    /// change.
    pub failures: i32,
}

impl fmt::Debug for ApprovalRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let outcome = self
            .outcome
            .map_or_else(|| "open".to_owned(), |it| format!("{it:?}"));
        write!(
            f,
            "ApprovalRecord({}, {}, {}, {} suggestions)",
            self.request_id,
            self.tool_name.as_deref().unwrap_or("no tool"),
            outcome,
            self.suggestions.len()
        )
    }
}

/// One of the request's `permission_suggestions`. `id` is `s1`, `s2`… by its place in that list,
/// so the host finds the suggestion again by position. `kind` is its `type` as the CLI wrote it;
/// `detail` the one thing the type is about (a `setMode`'s mode, an `addDirectories`' directories
/// one to a line), empty for any other type; `destination` is where the CLI would keep it. There is
/// no sentence: the screen words it. `raw` is the item as the CLI sent it, compact JSON, kept so the
/// host can give it back to the CLI unchanged when the user accepts it; the tree never carries it,
/// and neither does `Debug`.
#[derive(Clone, PartialEq, Eq, Default)]
pub struct SuggestionRecord {
    pub id: String,
    pub kind: String,
    pub detail: String,
    pub destination: Option<String>,
    pub raw: String,
}

impl fmt::Debug for SuggestionRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "SuggestionRecord({}, {}, {})",
            self.id,
            self.kind,
            self.destination.as_deref().unwrap_or("no destination")
        )
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum ApprovalOutcome {
    Approved,
    Denied,
    Cancelled,
    Expired,
}

/// Where content goes. None of it is shown; it decides which message a line belongs to.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct Routing {
    /// The key of the message of the turn that is receiving content, between its `started` and its
    /// `result`.
    pub current_turn: Option<String>,
    /// The key of the spontaneous-resume message that is open, between its first content and its
    /// `result`.
    pub open_resume: Option<String>,
    /// The Anthropic message the `stream_event` frames belong to, from its `message_start` to its
    /// `message_stop`.
    pub streaming: Option<String>,
    /// The message key of each started turn, by `command_uuid`.
    pub turns: HashMap<String, String>,
    /// How many user messages the host sent.
    pub sends: i32,
    /// The `command_uuid` of each turn open when the user pressed stop, until the next `result`.
    pub stopping: HashSet<String>,
    /// The turns a stop ended: they do not run any more, whether or not a `result` named them.
    pub stopped: HashSet<String>,
    /// Where each Anthropic message goes, by its `message.id`.
    pub anthropic: HashMap<String, AnthropicRoute>,
    /// The location of the message holding each tool call, by the call's key.
    pub tools: HashMap<String, Arc<[String]>>,
}

/// The route of one Anthropic message. `location` is the path of keys to the message record that
/// receives its blocks: one top-level message key, or that followed by tool-call key and nested
/// message key pairs. `blocks` counts the blocks its `assistant` snapshot lines carried so far —
/// each line carries the next block, so the count is the next block's index. `streamed` maps a
/// streamed block's index to its part key.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct AnthropicRoute {
    pub location: Arc<[String]>,
    pub blocks: i32,
    pub streamed: HashMap<i32, String>,
}
