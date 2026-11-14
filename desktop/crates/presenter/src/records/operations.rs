//! What the operations console shows, kept next to the transcript: what the host asked the CLI to
//! change and how each request ended, the models the CLI offers, the context usage, the tokens and
//! the compactions (OperationRecords.kt).

use std::sync::Arc;

use imbl::Vector;

use crate::records::mcp::McpServerRecord;
use crate::records::rewind::RewindRecord;

/// What a request to the CLI is about. A request is recorded under the id the host made for it,
/// before it is sent.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum ControlKind {
    Model,
    Mode,
    Context,
    /// The list of MCP servers: it waits in its own column, as the usage does.
    McpStatus,
    /// An MCP server turned on, off, or reconnected; the value is the server's name.
    McpEnable,
    McpDisable,
    McpReconnect,
    /// The settings in effect (`get_settings`): it waits in its own column, as the usage does.
    Settings,
    /// The effort changed live (`apply_flag_settings`); the value is the level.
    Effort,
    /// The sandbox turned on (a restart with `--settings`) or off (`apply_flag_settings`); the
    /// value is `"true"` or `"false"`. The CLI's settings say whether it took: the record waits for
    /// their answer.
    Sandbox,
}

/// What a switch the user asked for is about. `Effort` is changed live. `Resume` opens a saved
/// session in a new one: only a refusal is a record of it, and of `Attachment` (a message the host
/// did not send).
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum SwitchKind {
    Model,
    Mode,
    Effort,
    Resume,
    Attachment,
    McpEnable,
    McpDisable,
    McpReconnect,
    Sandbox,
}

impl SwitchKind {
    pub fn wire(self) -> &'static str {
        match self {
            Self::Model => "model",
            Self::Mode => "mode",
            Self::Effort => "effort",
            Self::Resume => "resume",
            Self::Attachment => "attachment",
            Self::McpEnable => "mcp-enable",
            Self::McpDisable => "mcp-disable",
            Self::McpReconnect => "mcp-reconnect",
            Self::Sandbox => "sandbox",
        }
    }
}

/// How a switch ended. `Pending` is asked and not answered.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum SwitchOutcome {
    #[default]
    Pending,
    Applied,
    Rejected,
    Failed,
}

impl SwitchOutcome {
    pub fn wire(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Applied => "applied",
            Self::Rejected => "rejected",
            Self::Failed => "failed",
        }
    }
}

/// One switch: what was asked for (`value`, as the user chose it), and how it ended. `seq` is its
/// place in the order things were folded, one number for switches and compactions together;
/// `detail` is the sentence of a refusal. The request's `id` is the host's own mark and is never
/// shown in the tree.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SwitchRecord {
    pub id: String,
    pub seq: i32,
    pub kind: SwitchKind,
    pub value: String,
    pub outcome: SwitchOutcome,
    pub detail: Option<String>,
}

/// One model the CLI offers (the `initialize` response's `models`).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ModelRecord {
    pub value: String,
    pub resolved_model: Option<String>,
    pub display_name: String,
    pub description: String,
    pub supports_effort: Option<bool>,
    pub supported_effort_levels: Option<Arc<[String]>>,
}

/// The last context usage the CLI answered (`get_context_usage`, summary).
#[derive(Clone, PartialEq, Debug)]
pub struct ContextRecord {
    pub total_tokens: i64,
    pub max_tokens: i64,
    pub percentage: f64,
    pub auto_compact_threshold: Option<i64>,
}

/// One compaction the CLI did (`system/compact_boundary`).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct CompactionRecord {
    pub seq: i32,
    pub trigger: String,
    pub pre_tokens: i64,
    pub post_tokens: i64,
}

/// The session's tokens so far, summed over the models of the last `result`'s `modelUsage` (a
/// running total).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct TokenTotals {
    pub input: i64,
    pub output: i64,
    pub cache_read: i64,
    pub cache_creation: i64,
}

/// Everything the console shows that core does not keep, as one value so the projection compares
/// it in one step. `seq` is the last number given. `waiting` are the ids of the usage requests not
/// answered yet, oldest first, and `mcp_waiting` those of the MCP status requests (a column of
/// their own, so that neither pushes the other out). `mcp_servers` is the last list the CLI gave
/// (`None` before the first answer, an empty list for a session with no server) and
/// `mcp_unreadable` says the last ask could not be read, so the list is the one before it.
/// `built_in_mcp_servers` are the names of the in-process servers the session declared when it was
/// opened.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct OperationRecords {
    pub seq: i32,
    pub switches: Vector<SwitchRecord>,
    pub waiting: Vector<String>,
    pub context: Option<ContextRecord>,
    pub compactions: Vector<CompactionRecord>,
    pub compacting: bool,
    /// The effort in effect: the level the session was started with (`--effort`), then the one the
    /// CLI's settings say it sends with its next request (`get_settings`'s `applied.effort`). An
    /// answer whose effort is `None` (a model that takes none) leaves it as it was.
    pub effort: Option<String>,
    /// The model the CLI says it uses (`get_settings`'s `applied.model`), known before the first
    /// message; `None` until that answer. Not `system/init`'s model, which comes after the first
    /// message.
    pub applied_model: Option<String>,
    /// The ids of the settings requests not answered yet, a column of their own as `mcp_waiting`
    /// is.
    pub settings_waiting: Vector<String>,
    pub models: Arc<[ModelRecord]>,
    /// The permission mode the `initialize` response says the CLI is in; `None` until that answer.
    pub start_permission_mode: Option<String>,
    pub tokens: Option<TokenTotals>,
    pub mcp_waiting: Vector<String>,
    pub mcp_servers: Option<Arc<[McpServerRecord]>>,
    pub mcp_unreadable: bool,
    pub built_in_mcp_servers: Arc<[String]>,
    /// The last rewind of the files the webview asked for; `None` before the first.
    pub rewind: Option<RewindRecord>,
    /// Whether the sandbox is on, as the last settings answer says (`effective.sandbox.enabled`;
    /// no key is off). `None` until a CLI answers: each launch waits for its own CLI's answer, and
    /// `launch_sandbox` is shown meanwhile.
    pub sandbox: Option<bool>,
    /// Whether the session was launched asking for the sandbox.
    pub launch_sandbox: bool,
    /// The id of the sandbox switch that the next settings answer confirms or fails.
    pub sandbox_confirming: Option<String>,
    /// The session was launched into the sandbox and no settings answer has said whether it is on.
    pub launch_unconfirmed: bool,
    /// The first settings request asked after `sandbox_confirming` or `launch_unconfirmed` was set:
    /// only its answer confirms them (an answer to one asked before says what the sandbox was).
    pub sandbox_check: Option<String>,
    /// A switch to `bypassPermissions` was applied once in this session; it stays set.
    pub bypass_entered: bool,
    /// A switch to `auto` was refused or could not be sent once in this session; it stays set.
    pub auto_rejected: bool,
}

/// The most switches kept (the newest); an answer for one pushed out is an answer for an id nobody
/// knows.
pub const MAX_SWITCHES: usize = 20;

/// The most usage requests kept while they wait for an answer (the newest): a CLI that never
/// answers cannot fill it.
pub const MAX_WAITING: usize = 5;

/// The most compactions kept (the newest).
pub const MAX_COMPACTIONS: usize = 20;

/// The sentence of an effort switch the host refused because a turn was running.
pub const EFFORT_REFUSED_TURN: &str = "A turn is running";

/// The sentence of a switch into the sandbox the host refused because a turn was running (it is a
/// restart).
pub const SANDBOX_REFUSED_TURN: &str = "A turn is running";

/// The sentences of a sandbox switch the CLI's settings did not confirm.
pub const SANDBOX_NOT_APPLIED: &str = "The settings do not say the sandbox is on";
pub const SANDBOX_NOT_OFF: &str = "The settings still say the sandbox is on";
pub const SANDBOX_NOT_CONFIRMED: &str = "The settings could not be read";

/// The sentence of a launch into the sandbox that did not start, when the CLI gave none.
pub const SANDBOX_NOT_STARTED: &str = "The CLI did not start with the sandbox";
