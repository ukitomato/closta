//! What the composer shows, worked out from the conversation (ComposerState.kt): the model and
//! effort in effect, the permission mode, the context used, the switch waiting for an answer. Every
//! name and level is the CLI's own; nothing is written into the app.

use std::fmt;
use std::sync::Arc;

use closta_model::ConversationState;

use crate::records::composer::SlashCommandRecord;
use crate::records::operations::{
    ContextRecord, ModelRecord, OperationRecords, SwitchKind, SwitchOutcome, SwitchRecord,
    TokenTotals,
};
use crate::thread_running::thread_is_running;
use crate::transcript::Transcript;

/// Its `Debug` says whether there is a cost, never the cost.
#[derive(Clone, PartialEq)]
pub struct ComposerState {
    pub model: ModelChoice,
    pub models: Vec<ModelChoice>,
    /// The model in use when the CLI's list does not name it (shown as a disabled first row).
    pub unknown_model: Option<String>,
    pub effort: Option<String>,
    /// The levels the model in effect takes; empty when it takes none.
    pub effort_levels: Vec<String>,
    /// Effort can be changed only between turns (the CLI refuses it during one).
    pub effort_enabled: bool,
    pub mode: Option<String>,
    pub modes: &'static [&'static str],
    pub context: Option<ContextRecord>,
    pub tokens: Option<TokenTotals>,
    pub cost_usd: Option<f64>,
    /// The last model, mode, effort or sandbox switch still waiting for the CLI's answer.
    pub switching: Option<SwitchRecord>,
    pub running: bool,
    /// Stop was pressed and the CLI has not answered with a `result` yet.
    pub stopping: bool,
    pub commands: Arc<[SlashCommandRecord]>,
    pub sandbox: SandboxView,
    /// The newest sandbox switch, when it was refused or failed.
    pub sandbox_failure: Option<SwitchRecord>,
    /// The CLI is compacting the conversation in this turn; one it never said ended is over with
    /// the turn.
    pub compacting: bool,
}

impl fmt::Debug for ComposerState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ComposerState")
            .field("model", &self.model)
            .field("models", &self.models)
            .field("unknown_model", &self.unknown_model)
            .field("effort", &self.effort)
            .field("effort_levels", &self.effort_levels)
            .field("effort_enabled", &self.effort_enabled)
            .field("mode", &self.mode)
            .field("modes", &self.modes)
            .field("context", &self.context)
            .field("tokens", &self.tokens)
            .field("cost_usd", &self.cost_usd.map(|_| "set"))
            .field("switching", &self.switching)
            .field("running", &self.running)
            .field("stopping", &self.stopping)
            .field("commands", &self.commands)
            .field("sandbox", &self.sandbox)
            .field("sandbox_failure", &self.sandbox_failure)
            .field("compacting", &self.compacting)
            .finish()
    }
}

/// The sandbox button: whether the sandbox is on, and why it cannot be pressed now, if it cannot.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct SandboxView {
    pub on: bool,
    pub blocked: Option<SandboxBlock>,
}

/// Why the sandbox button cannot be pressed: a switch waits for the CLI, or the thread is running
/// and turning the sandbox on is a restart (turning it off is not, so it is never blocked for
/// that).
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum SandboxBlock {
    Switching,
    Running,
}

/// One row of the model list. `label` is what the button says; `resolved` the model's full id,
/// when the CLI gave it.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ModelChoice {
    pub value: String,
    pub label: String,
    pub description: String,
    pub resolved: Option<String>,
}

/// The CLI's permission modes, in the order Shift+Tab goes through them.
pub const PERMISSION_MODES: [&str; 6] = [
    "default",
    "acceptEdits",
    "plan",
    "auto",
    "dontAsk",
    "bypassPermissions",
];

/// The effort levels the CLI names, weakest first.
pub const EFFORT_LEVELS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];

const DEFAULT_MODEL: &str = "default";
const DEFAULT_WORD: &str = "Default";

fn shown(kind: SwitchKind) -> bool {
    matches!(
        kind,
        SwitchKind::Model | SwitchKind::Mode | SwitchKind::Effort | SwitchKind::Sandbox
    )
}

pub fn composer_state(conversation: &ConversationState, transcript: &Transcript) -> ComposerState {
    let operations = &transcript.operations;
    let records = &operations.models;
    let in_use = conversation
        .session
        .as_ref()
        .map(|it| it.model.as_str())
        .or(operations.applied_model.as_deref());
    let effect = in_effect(operations, in_use);
    let running = thread_is_running(conversation, transcript);
    // RunningTasks.kt's `runningTasks(transcript).isNotEmpty()`: every task that is not ambient
    // is a row of the running list.
    let tasks_running = transcript.background.live.iter().any(|it| !it.ambient);
    ComposerState {
        model: effect.model,
        models: records
            .iter()
            .map(|it| choice_of(it, records, in_use))
            .collect(),
        unknown_model: effect.unknown,
        effort: operations.effort.clone(),
        effort_levels: effect
            .chosen
            .filter(|it| it.supports_effort == Some(true))
            .and_then(|it| it.supported_effort_levels.as_deref())
            .map(<[String]>::to_vec)
            .unwrap_or_default(),
        effort_enabled: !running,
        mode: conversation
            .session
            .as_ref()
            .map(|it| it.permission_mode.clone())
            .or_else(|| last_applied(operations, SwitchKind::Mode).map(str::to_owned))
            .or_else(|| operations.start_permission_mode.clone()),
        modes: &PERMISSION_MODES,
        context: operations.context.clone(),
        tokens: operations.tokens,
        cost_usd: Some(conversation.usage.session_cost_usd).filter(|it| *it > 0.0),
        switching: operations
            .switches
            .iter()
            .rev()
            .find(|it| shown(it.kind) && it.outcome == SwitchOutcome::Pending)
            .cloned(),
        running,
        stopping: running && !transcript.routing.stopping.is_empty(),
        commands: Arc::clone(&transcript.commands.items),
        sandbox: sandbox_view(operations, running || tasks_running),
        sandbox_failure: operations
            .switches
            .iter()
            .rev()
            .find(|it| it.kind == SwitchKind::Sandbox)
            .filter(|it| matches!(it.outcome, SwitchOutcome::Rejected | SwitchOutcome::Failed))
            .cloned(),
        compacting: operations.compacting && running,
    }
}

fn sandbox_view(operations: &OperationRecords, busy: bool) -> SandboxView {
    let on = operations.sandbox.unwrap_or(operations.launch_sandbox);
    let switching = operations
        .switches
        .iter()
        .any(|it| it.kind == SwitchKind::Sandbox && it.outcome == SwitchOutcome::Pending);
    let blocked = if switching {
        Some(SandboxBlock::Switching)
    } else if !on && busy {
        Some(SandboxBlock::Running)
    } else {
        None
    };
    SandboxView { on, blocked }
}

struct InEffect<'a> {
    chosen: Option<&'a ModelRecord>,
    unknown: Option<String>,
    model: ModelChoice,
}

/// The model in effect: the last switch the CLI applied, else the model it says it uses matched to
/// a row by value or full id, else the default row. A model the list does not name is
/// `InEffect::unknown`.
fn in_effect<'a>(operations: &'a OperationRecords, in_use: Option<&str>) -> InEffect<'a> {
    let records = &operations.models;
    let switched = last_applied(operations, SwitchKind::Model);
    let chosen = switched
        .and_then(|value| records.iter().find(|it| it.value == value))
        .or_else(|| {
            in_use.and_then(|id| {
                records
                    .iter()
                    .find(|it| it.value == id || it.resolved_model.as_deref() == Some(id))
            })
        })
        .or_else(|| {
            records
                .iter()
                .find(|it| it.value == DEFAULT_MODEL)
                .filter(|_| in_use.is_none())
        });
    let unknown = in_use
        .filter(|_| chosen.is_none() && switched.is_none())
        .map(str::to_owned);
    let model = match (chosen, &unknown) {
        (Some(chosen), _) => choice_of(chosen, records, in_use),
        (None, Some(unknown)) => ModelChoice {
            value: unknown.clone(),
            label: unknown.clone(),
            description: String::new(),
            resolved: Some(unknown.clone()),
        },
        (None, None) => ModelChoice {
            value: DEFAULT_MODEL.to_owned(),
            label: DEFAULT_WORD.to_owned(),
            description: String::new(),
            resolved: None,
        },
    };
    InEffect {
        chosen,
        unknown,
        model,
    }
}

fn last_applied(operations: &OperationRecords, kind: SwitchKind) -> Option<&str> {
    operations
        .switches
        .iter()
        .rev()
        .find(|it| it.kind == kind && it.outcome == SwitchOutcome::Applied)
        .map(|it| it.value.as_str())
}

/// The row for `record`; the default row names the model it stands for, in brackets, as the CLI
/// shows it.
fn choice_of(record: &ModelRecord, records: &[ModelRecord], in_use: Option<&str>) -> ModelChoice {
    if record.value != DEFAULT_MODEL {
        return ModelChoice {
            value: record.value.clone(),
            label: record.display_name.clone(),
            description: record.description.clone(),
            resolved: record.resolved_model.clone(),
        };
    }
    let behind = in_use.map(|id| {
        records
            .iter()
            .find(|it| {
                it.value != DEFAULT_MODEL
                    && (it.value == id || it.resolved_model.as_deref() == Some(id))
            })
            .map_or(id, |it| it.display_name.as_str())
    });
    ModelChoice {
        value: record.value.clone(),
        label: behind.map_or_else(
            || DEFAULT_WORD.to_owned(),
            |behind| format!("{DEFAULT_WORD} ({behind})"),
        ),
        description: record.description.clone(),
        resolved: in_use.map(str::to_owned),
    }
}

/// The label for a narrow composer: "Default (Opus 5.5)" says only "Opus 5.5".
pub fn short_label(choice: &ModelChoice) -> &str {
    choice
        .label
        .strip_prefix(&format!("{DEFAULT_WORD} ("))
        .map_or(&choice.label, |rest| rest.strip_suffix(')').unwrap_or(rest))
}
