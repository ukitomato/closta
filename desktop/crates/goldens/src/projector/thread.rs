//! Projects one thread (ThreadProjection.kt), with the facts it is drawn with (ProjectionMemo.kt's
//! `Context`). Kotlin's memo is left out: every node is built afresh.

use std::collections::{HashMap, HashSet};

use closta_model::{ConversationState, Task, TaskStatus, Turn, TurnPhase};
use closta_presenter::json::compact;
use closta_presenter::keyed::{Keyed, claim_key, of_cli_id};
use closta_presenter::thread_running::thread_is_running;
use closta_presenter::transcript::{
    ApprovalRecord, MessageRecord, MessageSource, PartRecord, Role, TextRecord, ToolCallRecord,
    Transcript,
};
use serde_json::{Value, json};

use super::extras::{extras, thread_node};
use super::leaves::tool_leaves;
use super::nodes::{
    Look, Status, approval_node, attachment_node, collection_node, levels, message_node,
    other_node, text_node, tool_call_node,
};
use super::question::{Question, asked_question};

/// A built node, and whether a pending approval sits anywhere under it.
struct Projected {
    node: Value,
    pending: bool,
}

/// Entries in their order, built into a collection.
#[derive(Default)]
struct Entries {
    items: Vec<(String, Projected)>,
}

impl Entries {
    fn contains(&self, key: &str) -> bool {
        self.items.iter().any(|(taken, _)| taken == key)
    }

    fn push(&mut self, key: String, projected: Projected) {
        self.items.push((key, projected));
    }

    fn collection(self) -> Projected {
        let pending = self.items.iter().any(|(_, it)| it.pending);
        let node = collection_node(
            self.items
                .into_iter()
                .map(|(key, it)| (key, it.node))
                .collect(),
        );
        Projected { node, pending }
    }
}

/// The domain facts a node is drawn with, besides its record: core's turns, tasks and pending
/// approvals, and the transcript's approvals.
struct Context<'a> {
    pending_ids: HashSet<&'a str>,
    /// The approval each tool call shows, chosen as [`Context::replaces`] says.
    approval_by_tool: HashMap<&'a str, &'a ApprovalRecord>,
    /// The latest task each tool call started.
    task_by_tool: HashMap<&'a str, &'a Task>,
    turn_by_command: HashMap<&'a str, &'a Turn>,
    approvals: &'a Keyed<ApprovalRecord>,
}

impl<'a> Context<'a> {
    fn new(conversation: &'a ConversationState, transcript: &'a Transcript) -> Self {
        let mut context = Self {
            pending_ids: conversation
                .pending_approvals
                .iter()
                .map(|it| it.request_id.as_str())
                .collect(),
            approval_by_tool: HashMap::new(),
            task_by_tool: conversation
                .tasks
                .iter()
                .filter_map(|task| Some((task.parent_tool_use_id.as_deref()?, task)))
                .collect(),
            turn_by_command: conversation
                .turns
                .iter()
                .map(|turn| (turn.command_uuid.as_str(), turn))
                .collect(),
            approvals: &transcript.approvals,
        };
        for record in transcript.approvals.values() {
            let Some(call) = record.tool_use_id.as_deref() else {
                continue;
            };
            if context.replaces(context.approval_by_tool.get(call).copied(), record) {
                context.approval_by_tool.insert(call, record);
            }
        }
        context
    }

    fn pending(&self, record: &ApprovalRecord) -> bool {
        self.pending_ids.contains(record.request_id.as_str())
    }

    /// Whether `candidate`, asked after `current` about the same call, is the one to show: the one
    /// the CLI is waiting on, if any, else the latest asked.
    fn replaces(&self, current: Option<&ApprovalRecord>, candidate: &ApprovalRecord) -> bool {
        current.is_none_or(|current| self.pending(candidate) || !self.pending(current))
    }

    fn turn_open(&self, command_uuid: &str) -> bool {
        self.turn_by_command
            .get(command_uuid)
            .is_some_and(|turn| turn.phase == TurnPhase::Open)
    }
}

/// An approval no tool call of the thread carries — its call has not arrived, or the request
/// named none. The projection makes a tool-call part for it so it can be answered; the part is
/// derived and never stored, so it is gone once the real call shows up.
struct Orphan<'a> {
    key: String,
    record: &'a ApprovalRecord,
}

/// Where a part is drawn: its level in the tree, whether its message still runs, and whether it is
/// the user's.
#[derive(Clone, Copy)]
struct Place {
    level: usize,
    running: bool,
    user: bool,
}

/// The node of the thread `id`.
pub(crate) fn project_thread(
    id: &str,
    conversation: &ConversationState,
    transcript: &Transcript,
) -> Value {
    let context = Context::new(conversation, transcript);
    let projection = ThreadProjection {
        context: &context,
        transcript,
    };
    let is_running = thread_is_running(conversation, transcript);
    let messages = projection.top_messages();
    thread_node(
        id,
        is_running,
        messages.node,
        extras(conversation, transcript),
    )
}

struct ThreadProjection<'a> {
    context: &'a Context<'a>,
    transcript: &'a Transcript,
}

impl<'a> ThreadProjection<'a> {
    /// A derived part goes to the assistant message its request belonged to, while that message
    /// is there; else to the last assistant message; with none, it gets a message of its own.
    fn top_messages(&self) -> Projected {
        let records = &self.transcript.messages;
        let assistants: Vec<&str> = records
            .order()
            .filter(|key| {
                records
                    .get(key)
                    .is_some_and(|it| it.role == Role::Assistant)
            })
            .collect();
        let last = assistants.last().copied();
        let mut placed: Vec<(Option<&str>, Vec<Orphan>)> = Vec::new();
        for orphan in self.orphans() {
            let anchor = orphan
                .record
                .anchor
                .as_deref()
                .filter(|it| assistants.contains(it))
                .or(last);
            match placed.iter_mut().find(|(key, _)| *key == anchor) {
                Some((_, group)) => group.push(orphan),
                None => placed.push((anchor, vec![orphan])),
            }
        }
        let mut take = |key: Option<&str>| {
            placed
                .iter_mut()
                .find(|(at, _)| *at == key)
                .map(|(_, group)| std::mem::take(group))
                .unwrap_or_default()
        };
        let level = levels::message_in(levels::TOP_MESSAGES);
        let mut entries = Entries::default();
        for key in records.order() {
            let Some(record) = records.get(key) else {
                continue;
            };
            let orphans = take(Some(key));
            entries.push(key.to_owned(), self.message(record, level, &orphans, false));
        }
        for orphan in take(None) {
            let key = claim_key(
                |taken| entries.contains(taken),
                &format!("approval:{}", orphan.record.request_id),
            );
            let message = self.orphan_message(&key, &orphan, level);
            entries.push(key, message);
        }
        entries.collection()
    }

    /// The approvals no tool call of the thread carries, one per call they name, chosen as
    /// [`Context::replaces`] says.
    fn orphans(&self) -> Vec<Orphan<'a>> {
        let mut by_key: Vec<Orphan<'a>> = Vec::new();
        for record in self.context.approvals.values() {
            let record: &'a ApprovalRecord = record;
            let key = match &record.tool_use_id {
                None => format!("approval:{}", record.request_id),
                Some(tool_use_id) => of_cli_id(tool_use_id),
            };
            let orphan =
                record.tool_use_id.is_none() || !self.transcript.routing.tools.contains_key(&key);
            if !orphan {
                continue;
            }
            match by_key.iter_mut().find(|it| it.key == key) {
                Some(slot) => {
                    if self.context.replaces(Some(slot.record), record) {
                        slot.record = record;
                    }
                }
                None => by_key.push(Orphan { key, record }),
            }
        }
        by_key
    }

    fn message(
        &self,
        record: &MessageRecord,
        level: usize,
        orphans: &[Orphan],
        scope: bool,
    ) -> Projected {
        let place = Place {
            level: levels::part_of(level),
            running: self.running_of(&record.source, scope),
            user: record.role == Role::User,
        };
        let parts = self.parts(record, place, orphans);
        let look = self.message_look(&record.source, parts.pending);
        Projected {
            node: message_node(&record.key, record.role, &look, parts.node),
            pending: parts.pending,
        }
    }

    fn parts(&self, record: &MessageRecord, place: Place, orphans: &[Orphan]) -> Projected {
        let mut entries = Entries::default();
        for key in record.parts.order() {
            let Some(part) = record.parts.get(key) else {
                continue;
            };
            entries.push(key.to_owned(), self.part(key, part, place));
        }
        for orphan in orphans {
            let key = claim_key(|taken| entries.contains(taken), &orphan.key);
            let part = self.derived_part(&key, orphan.record, place);
            entries.push(key, part);
        }
        entries.collection()
    }

    fn part(&self, key: &str, record: &PartRecord, place: Place) -> Projected {
        let node = match record {
            PartRecord::Text(text) => text_node(text, text_status(text, place)),
            PartRecord::Other(other) => other_node(other),
            PartRecord::Attachment(attachment) => attachment_node(attachment),
            // A part of its own type, which a client that does not know it shows as unknown
            // (TreeNodes.kt's `clearedNode`).
            PartRecord::Cleared(_) => json!({ "type": "cleared" }),
            PartRecord::ToolCall(call) => return self.tool_call(key, call, place),
        };
        Projected {
            node,
            pending: false,
        }
    }

    fn tool_call(&self, key: &str, record: &ToolCallRecord, place: Place) -> Projected {
        let approval = self
            .context
            .approval_by_tool
            .get(record.tool_use_id.as_str())
            .copied();
        let pending = approval.is_some_and(|it| self.context.pending(it));
        let task = self
            .context
            .task_by_tool
            .get(record.tool_use_id.as_str())
            .copied();
        let (status, error) = tool_status(pending, task, record.result.is_some(), place.running);
        let look = Look {
            status: Some(status),
            error,
            approval: approval.map(|it| {
                let question = question_for(it, record.input.as_deref());
                approval_node(it, pending, question.as_ref(), place.level)
            }),
        };
        // A sub-agent's calls go on until the call that started it was cut off or failed: its
        // lines keep coming after the turn's result, and after a re-sent task_started that core
        // leaves complete (captures 10 and 11).
        let goes_on = !status.incomplete();
        let nested = (!record.messages.is_empty()).then(|| {
            self.nested_messages(&record.messages, levels::nested_under(place.level), goes_on)
        });
        let leaves = tool_leaves(
            &record.args_text,
            record.input.as_deref(),
            record.result.as_ref(),
            place.level,
            record.streaming,
        );
        let nested_pending = nested.as_ref().is_some_and(|it| it.pending);
        Projected {
            node: tool_call_node(
                key,
                &record.tool_name,
                leaves,
                look,
                nested.map(|it| it.node),
            ),
            pending: pending || nested_pending,
        }
    }

    fn derived_part(&self, key: &str, record: &ApprovalRecord, place: Place) -> Projected {
        let pending = self.context.pending(record);
        let task = record
            .tool_use_id
            .as_deref()
            .and_then(|it| self.context.task_by_tool.get(it).copied());
        let (status, error) = tool_status(pending, task, false, place.running);
        let question = question_for(record, None);
        let look = Look {
            status: Some(status),
            error,
            approval: Some(approval_node(
                record,
                pending,
                question.as_ref(),
                place.level,
            )),
        };
        // The request is the only account of this call: shown as text when it cannot be read as
        // JSON.
        let args_text = record
            .input
            .as_deref()
            .map_or_else(|| record.unreadable.clone().unwrap_or_default(), compact);
        let leaves = tool_leaves(
            &args_text,
            record.input.as_deref(),
            None,
            place.level,
            false,
        );
        let tool_name = record.tool_name.as_deref().unwrap_or("unknown");
        Projected {
            node: tool_call_node(key, tool_name, leaves, look, None),
            pending,
        }
    }

    fn orphan_message(&self, key: &str, orphan: &Orphan, level: usize) -> Projected {
        let place = Place {
            level: levels::part_of(level),
            running: false,
            user: false,
        };
        let mut entries = Entries::default();
        entries.push(
            orphan.key.clone(),
            self.derived_part(&orphan.key, orphan.record, place),
        );
        let parts = entries.collection();
        // No turn holds it, so nothing is running here: it waits for an answer or has ended.
        let look = Look::of(if parts.pending {
            Status::RequiresAction
        } else {
            Status::CompleteUnknown
        });
        Projected {
            node: message_node(key, Role::Assistant, &look, parts.node),
            pending: parts.pending,
        }
    }

    fn nested_messages(
        &self,
        messages: &Keyed<MessageRecord>,
        level: usize,
        scope: bool,
    ) -> Projected {
        let mut entries = Entries::default();
        for key in messages.order() {
            let Some(record) = messages.get(key) else {
                continue;
            };
            let message = self.message(record, levels::message_in(level), &[], scope);
            entries.push(key.to_owned(), message);
        }
        entries.collection()
    }

    /// Whether a message still runs: its turn is open, its resume has not ended, or (nested) its
    /// call was not cut off.
    fn running_of(&self, source: &MessageSource, scope: bool) -> bool {
        match source {
            MessageSource::Sent => false,
            MessageSource::Turn { command_uuid } => self.context.turn_open(command_uuid),
            MessageSource::Resume { end } => end.is_none(),
            MessageSource::Nested => scope,
        }
    }

    /// A message's status: core's turn for a turn the user started, the closing `result` the
    /// transcript kept for a spontaneous resume. A pending approval anywhere in it makes it wait
    /// for the user, whether or not its turn or resume has ended — the CLI still waits on the
    /// answer (a sub-agent may ask after its parent's turn ended, and a resume's result may leave
    /// a request pending). The user's and a sub-agent's messages have none.
    fn message_look(&self, source: &MessageSource, pending: bool) -> Look {
        match source {
            MessageSource::Sent | MessageSource::Nested => Look::default(),
            MessageSource::Turn { command_uuid } => {
                let turn = self.context.turn_by_command.get(command_uuid.as_str());
                match turn {
                    _ if pending => Look::of(Status::RequiresAction),
                    None => Look::of(Status::CompleteUnknown),
                    Some(turn) if turn.phase == TurnPhase::Open => Look::of(Status::Running),
                    Some(Turn {
                        incomplete_reason: None,
                        ..
                    }) => Look::of(Status::CompleteStop),
                    Some(turn) => Look {
                        error: turn.incomplete_reason.clone(),
                        ..Look::of(Status::Failed)
                    },
                }
            }
            MessageSource::Resume { end } => match end {
                _ if pending => Look::of(Status::RequiresAction),
                None => Look::of(Status::Running),
                Some(end) if end.is_error => Look {
                    error: Some(end.result.clone()),
                    ..Look::of(Status::Failed)
                },
                Some(_) => Look::of(Status::CompleteStop),
            },
        }
    }
}

/// What a request asks, when core holds it as a question; `call` is its tool call's input, where
/// there is one.
fn question_for(record: &ApprovalRecord, call: Option<&Value>) -> Option<Question> {
    if record.ask {
        asked_question(record.input.as_deref(), call)
    } else {
        None
    }
}

/// A user's words have no stream and no status; a block still streaming when its message stopped
/// was cut off.
fn text_status(record: &TextRecord, place: Place) -> Option<Status> {
    if place.user {
        None
    } else if !record.streaming {
        Some(Status::Complete)
    } else if place.running {
        Some(Status::Running)
    } else {
        Some(Status::Cancelled)
    }
}

/// A tool call's status: a pending approval first, then the task the call started — whose own
/// notification is the authority on how it ended, even after the call's result says it was
/// launched — then the result. A call left without one when its message stopped running was cut
/// off.
fn tool_status(
    pending: bool,
    task: Option<&Task>,
    has_result: bool,
    running: bool,
) -> (Status, Option<String>) {
    if pending {
        return (Status::RequiresAction, None);
    }
    if let Some(task) = task {
        return match task.status {
            TaskStatus::Running => (Status::Running, None),
            TaskStatus::Complete => (Status::Complete, None),
            TaskStatus::Incomplete => (Status::Failed, task.incomplete_reason.clone()),
        };
    }
    if has_result {
        (Status::Complete, None)
    } else if !running {
        (Status::Cancelled, None)
    } else {
        (Status::Running, None)
    }
}
