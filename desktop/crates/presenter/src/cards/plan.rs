//! An `ExitPlanMode` card and what answering it sends (PlanApproval.kt).

use std::fmt;

use closta_model::ApprovalDecision;
use serde_json::{Value, json};

use crate::input::PassedOn;
use crate::json::{JsonFields, compact};
use crate::records::operations::OperationRecords;
use crate::text::{kt_is_blank, kt_trim};
use crate::transcript::{ApprovalOutcome, ApprovalRecord};

use super::{allow_payload, object_input};

pub const PLAN_TOOL: &str = "ExitPlanMode";

/// The plan the CLI asks the user to approve. `plan` is the input's `plan` (capture 29), `None`
/// when it carries none; `go` is where the first choice goes once the plan is approved.
#[derive(Clone, PartialEq)]
pub struct PlanCard {
    pub request_id: String,
    pub plan: Option<String>,
    pub answered: Option<ApprovalOutcome>,
    pub failure: Option<String>,
    pub go: PlanGo,
}

// The plan is what Claude wrote for the user: never in a log.
impl fmt::Debug for PlanCard {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.answered {
            Some(outcome) => write!(f, "PlanCard({}, {outcome:?})", self.request_id),
            None => write!(f, "PlanCard({}, open)", self.request_id),
        }
    }
}

/// The mode the first choice approves into, as Claude Code offers it.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum PlanGo {
    Auto,
    AcceptEdits,
    Bypass,
}

impl PlanGo {
    pub fn mode(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::AcceptEdits => "acceptEdits",
            Self::Bypass => "bypassPermissions",
        }
    }
}

/// Bypass once it was entered, Accept Edits once Auto was refused, Auto otherwise.
pub fn plan_go_of(operations: &OperationRecords) -> PlanGo {
    if operations.bypass_entered {
        PlanGo::Bypass
    } else if operations.auto_rejected {
        PlanGo::AcceptEdits
    } else {
        PlanGo::Auto
    }
}

/// The three answers to a plan.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum PlanChoice {
    /// "Approve, and go": allow, then the card's [`PlanGo`] mode.
    Go,
    /// "Approve, confirm edits": allow; the CLI goes back to Default by itself on an allow
    /// (capture 29).
    AskEdits,
    /// "Keep planning": deny, with the user's sentence.
    KeepPlanning,
}

/// What answering a plan sends: the decision and its payload, and the mode to switch to once it
/// is sent. `passed_on` is what goes with the allow: for `Go` a `setMode` of the card's mode for
/// the session (sdk.d.ts PermissionUpdate).
#[derive(Clone, PartialEq)]
pub struct PlanAnswer {
    pub decision: ApprovalDecision,
    pub payload: String,
    pub mode_after: Option<String>,
    pub passed_on: PassedOn,
}

// The payload is the plan or the user's sentence: never in a log.
impl fmt::Debug for PlanAnswer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "PlanAnswer({:?}, {})",
            self.decision,
            self.mode_after.as_deref().unwrap_or("no switch")
        )
    }
}

fn mode_for_session(mode: &str) -> String {
    compact(&json!([{"type": "setMode", "mode": mode, "destination": "session"}]))
}

pub(crate) fn plan_card_of(approval: &ApprovalRecord, go: PlanGo) -> PlanCard {
    PlanCard {
        request_id: approval.request_id.clone(),
        plan: approval
            .input
            .as_deref()
            .and_then(Value::as_object)
            .and_then(|input| input.string("plan"))
            .filter(|plan| !kt_is_blank(plan))
            .map(str::to_owned),
        answered: approval.outcome,
        failure: approval.failure.clone(),
        go,
    }
}

/// The answer to `card` for `choice`; `comment` goes with a no, trimmed.
pub fn plan_answer(
    card: &PlanCard,
    approval: &ApprovalRecord,
    choice: PlanChoice,
    comment: &str,
) -> PlanAnswer {
    let request_id = card.request_id.clone();
    match choice {
        // The CLI goes back to default by itself on the allow (capture 29), so the allow carries
        // the mode to keep; the switch after it is only a backstop, should the CLI apply its own
        // reset last.
        PlanChoice::Go => PlanAnswer {
            decision: ApprovalDecision::Allow { request_id },
            payload: allow_payload(approval),
            mode_after: Some(card.go.mode().to_owned()),
            passed_on: PassedOn {
                updated_permissions: Some(mode_for_session(card.go.mode())),
                accepted_suggestions: Vec::new(),
                input: object_input(approval),
            },
        },
        PlanChoice::AskEdits => PlanAnswer {
            decision: ApprovalDecision::Allow { request_id },
            payload: allow_payload(approval),
            mode_after: None,
            passed_on: PassedOn::default(),
        },
        PlanChoice::KeepPlanning => PlanAnswer {
            decision: ApprovalDecision::Deny { request_id },
            payload: kt_trim(comment).to_owned(),
            mode_after: None,
            passed_on: PassedOn::default(),
        },
    }
}
