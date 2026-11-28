//! What the operations console shows, kept next to the transcript: what the host asked the CLI to
//! change and how each request ended, the models the CLI offers, the context usage, the tokens and
//! the compactions (OperationRecords.kt).

use std::sync::Arc;

use closta_model::{AgentEvent, RawJson};
use imbl::Vector;
use serde_json::{Map, Value};

use crate::input::{ControlRequested, EffortRefused, Launched, SandboxNotStarted};
use crate::json::{JsonFields, parse};
use crate::records::mcp::{McpServerRecord, mcp_sentence};
use crate::records::readings::models_of_response;
use crate::records::rewind::RewindRecord;
use crate::records::usage::{UsageRecord, usage_of};
use crate::refusal_sentence::{NO_SENTENCE, plain_sentence_of};
use crate::text::kt_is_blank;

/// What a request to the CLI is about. A request is recorded under the id the host made for it,
/// before it is sent.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum ControlKind {
    Model,
    Mode,
    Context,
    /// The session's cost and the plan's limits (`get_usage`): it waits in its own column.
    Usage,
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
    /// Whether a switch of this kind is about an MCP server: its sentence is made by
    /// `mcp_sentence`.
    pub fn is_mcp(self) -> bool {
        matches!(
            self,
            Self::McpEnable | Self::McpDisable | Self::McpReconnect
        )
    }

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
    /// The ids of the `get_usage` requests not answered yet, a column of their own as
    /// `mcp_waiting` is.
    pub usage_waiting: Vector<String>,
    /// The last `get_usage` answer that could be read; `None` before the first.
    pub usage: Option<UsageRecord>,
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

const BYPASS_MODE: &str = "bypassPermissions";
const AUTO_MODE: &str = "auto";
const SANDBOX_ON: &str = "true";
const SUCCESS: &str = "success";

/// The CLI's answer to a control request the host sent (`control_response`).
#[derive(Clone, Copy, Debug)]
pub(crate) struct Answer<'a> {
    pub request_id: Option<&'a str>,
    pub subtype: Option<&'a str>,
    pub response: &'a RawJson,
    pub error: Option<&'a str>,
}

impl<'a> Answer<'a> {
    /// `event` as an answer, when it is a `control_response`.
    pub fn of(event: &'a AgentEvent) -> Option<Self> {
        match event {
            AgentEvent::ControlResponse {
                response,
                request_id,
                subtype,
                error,
            } => Some(Self {
                request_id: request_id.as_deref(),
                subtype: subtype.as_deref(),
                response,
                error: error.as_deref(),
            }),
            _ => None,
        }
    }

    pub fn succeeded(&self) -> bool {
        self.subtype == Some(SUCCESS)
    }

    /// The answer's `response.response`, when it is an object.
    pub fn body(&self) -> Option<Map<String, Value>> {
        match parse(&self.response.0)? {
            Value::Object(mut fields) => match fields.remove("response")? {
                Value::Object(body) => Some(body),
                _ => None,
            },
            _ => None,
        }
    }
}

/// `items` without `id`.
pub(crate) fn without(items: &Vector<String>, id: &str) -> Vector<String> {
    items.iter().filter(|it| *it != id).cloned().collect()
}

/// `items` with `item` at the end, keeping the newest `max`.
pub(crate) fn pushed<T: Clone>(items: &Vector<T>, item: T, max: usize) -> Vector<T> {
    let mut items = items.clone();
    items.push_back(item);
    while items.len() > max {
        items.pop_front();
    }
    items
}

impl SwitchRecord {
    fn new(id: &str, seq: i32, kind: SwitchKind, value: &str) -> Self {
        Self {
            id: id.to_owned(),
            seq,
            kind,
            value: value.to_owned(),
            outcome: SwitchOutcome::Pending,
            detail: None,
        }
    }

    fn over(self, outcome: SwitchOutcome, detail: Option<&str>) -> Self {
        Self {
            outcome,
            detail: detail.map(str::to_owned),
            ..self
        }
    }

    fn is_mode(&self, mode: &str) -> bool {
        self.kind == SwitchKind::Mode && self.value == mode
    }

    fn pending(&self) -> bool {
        self.outcome == SwitchOutcome::Pending
    }
}

impl OperationRecords {
    pub(crate) fn next_seq(&self) -> i32 {
        self.seq.wrapping_add(1)
    }

    fn has_switch(&self, id: &str) -> bool {
        self.switches.iter().any(|it| it.id == id)
    }

    /// The host is about to send a request: a switch waits for its answer, a usage, list or
    /// settings request waits in its own column. An id already recorded changes nothing.
    pub(crate) fn control(&self, input: &ControlRequested) -> Self {
        let id = input.request_id.as_str();
        if self.knows(id) {
            return self.clone();
        }
        let value = input.value.as_deref().unwrap_or_default();
        let switch = |kind| self.with_switch(SwitchRecord::new(id, self.next_seq(), kind, value));
        match input.kind {
            ControlKind::Context => Self {
                waiting: pushed(&self.waiting, id.to_owned(), MAX_WAITING),
                ..self.clone()
            },
            ControlKind::Usage => Self {
                usage_waiting: pushed(&self.usage_waiting, id.to_owned(), MAX_WAITING),
                ..self.clone()
            },
            ControlKind::McpStatus => Self {
                mcp_waiting: pushed(&self.mcp_waiting, id.to_owned(), MAX_WAITING),
                ..self.clone()
            },
            ControlKind::Settings => self.settings_asked(id),
            ControlKind::McpEnable => switch(SwitchKind::McpEnable),
            ControlKind::McpDisable => switch(SwitchKind::McpDisable),
            ControlKind::McpReconnect => switch(SwitchKind::McpReconnect),
            ControlKind::Model => switch(SwitchKind::Model),
            ControlKind::Mode => switch(SwitchKind::Mode),
            ControlKind::Effort => switch(SwitchKind::Effort),
            ControlKind::Sandbox => switch(SwitchKind::Sandbox),
        }
    }

    /// A record of the host's own that is over at once (a refusal), unless `id` is already one.
    pub(crate) fn refused(
        &self,
        id: &str,
        kind: SwitchKind,
        value: &str,
        detail: Option<&str>,
    ) -> Self {
        if self.has_switch(id) {
            return self.clone();
        }
        self.with_switch(
            SwitchRecord::new(id, self.next_seq(), kind, value)
                .over(SwitchOutcome::Rejected, detail),
        )
    }

    /// The host refused an effort switch: it is a record that is over at once.
    pub(crate) fn refuse_effort(&self, input: &EffortRefused) -> Self {
        self.refused(
            &input.request_id,
            SwitchKind::Effort,
            &input.effort,
            Some(EFFORT_REFUSED_TURN),
        )
    }

    /// The host refused a switch into the sandbox: it is a record that is over at once.
    pub(crate) fn refuse_sandbox(&self, request_id: &str) -> Self {
        self.refused(
            request_id,
            SwitchKind::Sandbox,
            SANDBOX_ON,
            Some(SANDBOX_REFUSED_TURN),
        )
    }

    /// A CLI was launched: its effort, its own MCP servers, and whether it was asked into the
    /// sandbox. What the last CLI's settings said of the sandbox no longer holds; a pending switch
    /// into the sandbox is confirmed by this CLI's answer.
    pub(crate) fn launched(&self, input: &Launched) -> Self {
        let switching = if input.sandbox {
            self.switches
                .iter()
                .rev()
                .find(|it| it.kind == SwitchKind::Sandbox && it.value == SANDBOX_ON && it.pending())
                .map(|it| it.id.clone())
        } else {
            None
        };
        Self {
            effort: input.effort.clone().filter(|it| !it.is_empty()),
            built_in_mcp_servers: Arc::from(input.built_in_mcp_servers.as_slice()),
            sandbox: None,
            launch_sandbox: input.sandbox,
            launch_unconfirmed: input.sandbox,
            sandbox_confirming: switching.or_else(|| self.sandbox_confirming.clone()),
            // The settings asked of the last CLI do not say what this one runs with.
            sandbox_check: None,
            ..self.clone()
        }
    }

    /// The CLI asked into the sandbox did not start: the switch fails, or a launch that was no
    /// switch is a failed one.
    pub(crate) fn sandbox_not_started(&self, input: &SandboxNotStarted) -> Self {
        let detail = input
            .detail
            .as_deref()
            .filter(|it| !kt_is_blank(it))
            .map_or_else(|| SANDBOX_NOT_STARTED.to_owned(), plain_sentence_of);
        let id = input.request_id.as_str();
        let record = self.switches.iter().find(|it| it.id == id);
        let ours = record.is_none_or(|it| it.kind == SwitchKind::Sandbox);
        let failed = match record {
            None => self.with_switch(
                SwitchRecord::new(id, self.next_seq(), SwitchKind::Sandbox, SANDBOX_ON)
                    .over(SwitchOutcome::Failed, Some(&detail)),
            ),
            Some(_) if ours => self.settle(id, |it| it.over(SwitchOutcome::Failed, Some(&detail))),
            Some(_) => self.clone(),
        };
        Self {
            // The CLI that runs instead is not in the sandbox.
            sandbox: if ours { Some(false) } else { failed.sandbox },
            sandbox_confirming: None,
            launch_unconfirmed: false,
            sandbox_check: None,
            ..failed
        }
    }

    /// A settings request; the first one after a sandbox switch took, or after a launch into it,
    /// is the check.
    fn settings_asked(&self, id: &str) -> Self {
        let checks = self.sandbox_check.is_none()
            && (self.sandbox_confirming.is_some() || self.launch_unconfirmed);
        Self {
            settings_waiting: pushed(&self.settings_waiting, id.to_owned(), MAX_WAITING),
            sandbox_check: if checks {
                Some(id.to_owned())
            } else {
                self.sandbox_check.clone()
            },
            ..self.clone()
        }
    }

    pub(crate) fn with_switch(&self, record: SwitchRecord) -> Self {
        Self {
            seq: record.seq,
            switches: pushed(&self.switches, record, MAX_SWITCHES),
            ..self.clone()
        }
    }

    /// The request could not be written: a switch fails, a usage request is not waited for.
    pub(crate) fn send_failed(&self, id: &str) -> Self {
        if let Some(rewind) = self.rewind_send_failed(id) {
            return rewind;
        }
        if self.waiting.contains(&id.to_owned()) {
            Self {
                waiting: without(&self.waiting, id),
                ..self.clone()
            }
        } else if self.usage_waiting.contains(&id.to_owned()) {
            Self {
                usage_waiting: without(&self.usage_waiting, id),
                ..self.clone()
            }
        } else if self.settings_waiting.contains(&id.to_owned()) {
            // A sandbox check that could not be asked waits for the next settings request.
            Self {
                settings_waiting: without(&self.settings_waiting, id),
                sandbox_check: self.sandbox_check.clone().filter(|it| it != id),
                ..self.clone()
            }
        } else if self.mcp_waiting.contains(&id.to_owned()) {
            // The list could not be asked for: what is shown is the one before, and it says so.
            Self {
                mcp_waiting: without(&self.mcp_waiting, id),
                mcp_unreadable: true,
                ..self.clone()
            }
        } else {
            self.ended(id, |it| it.over(SwitchOutcome::Failed, None))
        }
    }

    /// Whether `id` is already recorded: a switch, or a request still waited for.
    fn knows(&self, id: &str) -> bool {
        let id = id.to_owned();
        self.has_switch(&id)
            || self.waiting.contains(&id)
            || self.usage_waiting.contains(&id)
            || self.mcp_waiting.contains(&id)
            || self.settings_waiting.contains(&id)
    }

    /// The CLI's answer to a request. An id nobody asked with, or an answer to a settled one,
    /// changes nothing. One branch per kind of request the host sends.
    pub(crate) fn answered(&self, answer: &Answer<'_>) -> Self {
        let Some(id) = answer.request_id else {
            return self.clone();
        };
        if let Some(rewind) = self.rewind_answered(answer) {
            return rewind;
        }
        let owned = id.to_owned();
        if self.waiting.contains(&owned) {
            let read = if answer.succeeded() {
                answer.body().as_ref().and_then(context_of)
            } else {
                None
            };
            Self {
                waiting: without(&self.waiting, id),
                context: read.or_else(|| self.context.clone()),
                ..self.clone()
            }
        } else if self.usage_waiting.contains(&owned) {
            let read = if answer.succeeded() {
                answer.body().as_ref().and_then(usage_of)
            } else {
                None
            };
            Self {
                usage_waiting: without(&self.usage_waiting, id),
                usage: read.or_else(|| self.usage.clone()),
                ..self.clone()
            }
        } else if self.mcp_waiting.contains(&owned) {
            self.mcp_answered(id, answer.response, answer.succeeded())
        } else if self.settings_waiting.contains(&owned) {
            self.settings_answered(id, answer)
        } else if answer.succeeded() {
            self.switch_applied(id)
        } else {
            self.ended(id, |it| {
                let detail = sentence_of(answer.error, it.kind);
                it.over(SwitchOutcome::Rejected, Some(&detail))
            })
        }
    }

    /// The CLI took the switch `id`. A switch already over, or one nobody asked for, changes
    /// nothing.
    fn switch_applied(&self, id: &str) -> Self {
        let Some(record) = self.switches.iter().find(|it| it.id == id && it.pending()) else {
            return self.clone();
        };
        // Taken is not in force: the settings asked after it say whether the sandbox is off.
        if record.kind == SwitchKind::Sandbox {
            Self {
                sandbox_confirming: Some(id.to_owned()),
                sandbox_check: None,
                ..self.clone()
            }
        } else {
            self.switch_settled(&record.clone())
        }
    }

    /// A pending switch other than the sandbox's is applied as soon as the CLI takes it.
    fn switch_settled(&self, record: &SwitchRecord) -> Self {
        let settled = self.settle(&record.id, |it| it.over(SwitchOutcome::Applied, None));
        // An effort applied is in effect from the next request: shown at once, and the settings
        // asked after it say what the CLI really took.
        let effort_applied = record.kind == SwitchKind::Effort && !record.value.is_empty();
        let settled = Self {
            effort: if effort_applied {
                Some(record.value.clone())
            } else {
                settled.effort.clone()
            },
            bypass_entered: settled.bypass_entered || record.is_mode(BYPASS_MODE),
            ..settled
        };
        // A switch that ended now (not one already over) is written into the last list.
        settled.mcp_switch_applied(record)
    }

    /// The switch `id` ended without being applied; a switch to `auto` that did is remembered.
    fn ended(&self, id: &str, change: impl FnOnce(SwitchRecord) -> SwitchRecord) -> Self {
        let Some(record) = self.switches.iter().find(|it| it.id == id && it.pending()) else {
            return self.clone();
        };
        let auto = record.is_mode(AUTO_MODE);
        let settled = self.settle(id, change);
        Self {
            auto_rejected: settled.auto_rejected || auto,
            ..settled
        }
    }

    /// The answer to a settings request: `response.response.applied`'s `effort` and `model`
    /// (capture 28), and `effective.sandbox.enabled` (captures 33 to 40; no `sandbox` key is off).
    /// A refusal, or an answer without them, leaves what was shown. The answer also confirms or
    /// fails the sandbox switch or launch waiting for it.
    fn settings_answered(&self, id: &str, answer: &Answer<'_>) -> Self {
        let body = if answer.succeeded() {
            answer.body()
        } else {
            None
        };
        let applied = body.as_ref().and_then(|it| it.obj("applied"));
        let applied_word = |key: &str| {
            applied
                .and_then(|it| it.string(key))
                .filter(|it| !it.is_empty())
                .map(str::to_owned)
        };
        let read = body.as_ref().and_then(|it| it.obj("effective")).map(|it| {
            it.obj("sandbox")
                .and_then(|sandbox| sandbox.get("enabled"))
                .and_then(Value::as_bool)
                == Some(true)
        });
        Self {
            settings_waiting: without(&self.settings_waiting, id),
            effort: applied_word("effort").or_else(|| self.effort.clone()),
            applied_model: applied_word("model").or_else(|| self.applied_model.clone()),
            sandbox: read.or(self.sandbox),
            ..self.clone()
        }
        .sandbox_confirmed(id, read)
    }

    /// What the settings answer `settings_id` says of the sandbox switch waiting for it (`read` is
    /// `None` when the answer could not be read): applied when it says the value asked for, failed
    /// otherwise. With no switch waiting, a launch into the sandbox that the answer does not show
    /// on is a failed record under the settings request's id. Only the answer to `sandbox_check`
    /// decides. A sandbox that could not be confirmed on is off; one that could not be confirmed
    /// off is what was last read.
    fn sandbox_confirmed(self, settings_id: &str, read: Option<bool>) -> Self {
        if self.sandbox_check.as_deref() != Some(settings_id) {
            return self;
        }
        let record = self
            .switches
            .iter()
            .find(|it| Some(&it.id) == self.sandbox_confirming.as_ref() && it.pending())
            .cloned();
        let wanted_on = record.as_ref().is_none_or(|it| it.value == SANDBOX_ON);
        let detail = match &record {
            None => (self.launch_unconfirmed && read != Some(true)).then_some(SANDBOX_NOT_APPLIED),
            Some(_) => sandbox_failure(wanted_on, read),
        };
        let checked = match (&record, detail) {
            (Some(record), _) => {
                let outcome = if detail.is_none() {
                    SwitchOutcome::Applied
                } else {
                    SwitchOutcome::Failed
                };
                self.settle(&record.id, |it| it.over(outcome, detail))
            }
            (None, Some(detail)) => self.with_switch(
                SwitchRecord::new(
                    settings_id,
                    self.next_seq(),
                    SwitchKind::Sandbox,
                    SANDBOX_ON,
                )
                .over(SwitchOutcome::Failed, Some(detail)),
            ),
            (None, None) => self,
        };
        Self {
            sandbox: if detail.is_some() && wanted_on {
                Some(false)
            } else {
                checked.sandbox
            },
            sandbox_confirming: None,
            launch_unconfirmed: false,
            sandbox_check: None,
            ..checked
        }
    }

    /// The switch `id`, still pending, made `change` of; anything else changes nothing.
    pub(crate) fn settle(
        &self,
        id: &str,
        change: impl FnOnce(SwitchRecord) -> SwitchRecord,
    ) -> Self {
        let Some(index) = self.switches.iter().position(|it| it.id == id) else {
            return self.clone();
        };
        if !self.switches[index].pending() {
            return self.clone();
        }
        let mut switches = self.switches.clone();
        switches.set(index, change(self.switches[index].clone()));
        Self {
            switches,
            ..self.clone()
        }
    }
}

/// Why a switch to `on` failed when the settings read `read` (`None`: unreadable); `None` when it
/// took.
fn sandbox_failure(on: bool, read: Option<bool>) -> Option<&'static str> {
    match read {
        None => Some(SANDBOX_NOT_CONFIRMED),
        Some(read) if read == on => None,
        Some(_) if on => Some(SANDBOX_NOT_APPLIED),
        Some(_) => Some(SANDBOX_NOT_OFF),
    }
}

// A refusal of an MCP switch says what `mcp_sentence` makes of the CLI's error (a first line of at
// most 200 characters, its URLs without userinfo and query); the model's and the mode's stay as
// they were (500 characters).
fn sentence_of(error: Option<&str>, kind: SwitchKind) -> String {
    if kind.is_mcp() {
        error
            .map(mcp_sentence)
            .filter(|it| !it.is_empty())
            .unwrap_or_else(|| NO_SENTENCE.to_owned())
    } else {
        plain_sentence_of(error.unwrap_or_default())
    }
}

fn context_of(body: &Map<String, Value>) -> Option<ContextRecord> {
    Some(ContextRecord {
        total_tokens: body.count("totalTokens")?,
        max_tokens: body.count("maxTokens")?,
        percentage: body
            .number("percentage")
            .filter(|it| it.is_finite() && *it >= 0.0)?,
        auto_compact_threshold: body.count("autoCompactThreshold"),
    })
}

/// Whether `event` is an answer after which the host asks the CLI for its settings: the answer to
/// `initialize` (it lists the models), or the success of a model, effort or sandbox switch still
/// pending here (a new model has its own default effort; an effort is read back as the CLI took
/// it; the sandbox is in force only if the settings say so). Read on the records **before** the
/// event is folded.
pub fn asks_for_settings(operations: &OperationRecords, event: &AgentEvent) -> bool {
    let Some(answer) = Answer::of(event).filter(Answer::succeeded) else {
        return false;
    };
    let switched = operations.switches.iter().any(|it| {
        Some(it.id.as_str()) == answer.request_id
            && it.pending()
            && matches!(
                it.kind,
                SwitchKind::Model | SwitchKind::Effort | SwitchKind::Sandbox
            )
    });
    switched || models_of_response(parse(&answer.response.0).as_ref()).is_some()
}

/// The value of a sandbox switch that was pending in `before` and is applied in `after`; `None`
/// when none ended so.
pub fn applied_sandbox(before: &OperationRecords, after: &OperationRecords) -> Option<bool> {
    let pending: Vec<&str> = before
        .switches
        .iter()
        .filter(|it| it.kind == SwitchKind::Sandbox && it.pending())
        .map(|it| it.id.as_str())
        .collect();
    after
        .switches
        .iter()
        .rev()
        .find(|it| {
            it.kind == SwitchKind::Sandbox
                && it.outcome == SwitchOutcome::Applied
                && pending.contains(&it.id.as_str())
        })
        .map(|it| it.value == SANDBOX_ON)
}
