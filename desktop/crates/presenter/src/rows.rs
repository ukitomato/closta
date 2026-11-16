//! The conversation as rows, the unit a lazy list draws: one row per user message, per text or
//! thinking block, per tool call (ThreadRows.kt, and `agentRows` of RunningTasks.kt). A row says
//! what to draw and nothing of how. Rows of a record that did not change are the same `Arc`s as
//! before ([`ThreadRow::same`]), which is how a surface knows what it may leave alone.

use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::sync::Arc;

use serde_json::Value;

use crate::cards::plan::{PlanGo, plan_go_of};
use crate::cards::{ThreadCard, card_of};
use crate::json::JsonFields;
use crate::keyed::Keyed;
use crate::records::attachment::AttachmentRecord;
use crate::records::turn_end::TurnChangesRecord;
use crate::rewind_targets::sent_asks;
use crate::text::kt_is_blank;
use crate::tool_line::{AgentSummary, ToolDetail, ToolLine, agent_summary, tool_detail, tool_line};
use crate::transcript::{
    ApprovalRecord, MessageRecord, PartRecord, Role, ToolCallRecord, Transcript,
};

/// One row of the conversation. Cloning one is cheap: each variant holds its row in an `Arc`.
#[derive(Clone, PartialEq, Debug)]
pub enum ThreadRow {
    Ask(Arc<AskRow>),
    Text(Arc<TextRow>),
    Thinking(Arc<ThinkingRow>),
    Tool(Arc<ToolRow>),
    Explored(Arc<ExploredRow>),
    Todo(Arc<TodoRow>),
    Card(Arc<CardRow>),
    TurnEnd(Arc<TurnEndRow>),
    SignIn(Arc<SignInRow>),
}

impl ThreadRow {
    pub fn key(&self) -> &str {
        match self {
            Self::Ask(row) => &row.key,
            Self::Text(row) => &row.key,
            Self::Thinking(row) => &row.key,
            Self::Tool(row) => &row.key,
            Self::Explored(row) => &row.key,
            Self::Todo(row) => &row.key,
            Self::Card(row) => &row.key,
            Self::TurnEnd(row) => &row.key,
            Self::SignIn(row) => &row.key,
        }
    }

    /// Whether this row opens a message (a surface leaves more room above it).
    pub fn opens(&self) -> bool {
        match self {
            Self::Ask(_) => true,
            Self::Text(row) => row.opens,
            Self::Thinking(row) => row.opens,
            Self::Tool(row) => row.opens,
            Self::Explored(row) => row.opens,
            Self::Todo(row) => row.opens,
            Self::Card(row) => row.opens,
            Self::TurnEnd(row) => row.opens,
            Self::SignIn(_) => false,
        }
    }

    /// Whether `other` is this very row (Kotlin's `===`): the same variant holding the same `Arc`.
    pub fn same(&self, other: &ThreadRow) -> bool {
        match (self, other) {
            (Self::Ask(a), Self::Ask(b)) => Arc::ptr_eq(a, b),
            (Self::Text(a), Self::Text(b)) => Arc::ptr_eq(a, b),
            (Self::Thinking(a), Self::Thinking(b)) => Arc::ptr_eq(a, b),
            (Self::Tool(a), Self::Tool(b)) => Arc::ptr_eq(a, b),
            (Self::Explored(a), Self::Explored(b)) => Arc::ptr_eq(a, b),
            (Self::Todo(a), Self::Todo(b)) => Arc::ptr_eq(a, b),
            (Self::Card(a), Self::Card(b)) => Arc::ptr_eq(a, b),
            (Self::TurnEnd(a), Self::TurnEnd(b)) => Arc::ptr_eq(a, b),
            (Self::SignIn(a), Self::SignIn(b)) => Arc::ptr_eq(a, b),
            _ => false,
        }
    }
}

/// A message the user sent, with the files sent with it.
#[derive(Clone, PartialEq, Debug)]
pub struct AskRow {
    pub key: String,
    pub text: String,
    pub attachments: Vec<AttachmentRecord>,
}

/// A text block of a reply, as Markdown; the surface splits it into blocks of its own.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct TextRow {
    pub key: String,
    pub markdown: String,
    pub streaming: bool,
    pub opens: bool,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ThinkingRow {
    pub key: String,
    pub text: String,
    pub streaming: bool,
    pub opens: bool,
}

/// One tool call. A sub-agent's call is one of these too; what it did inside is read in a tab of
/// its own ([`agent_rows`]).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ToolRow {
    pub key: String,
    pub line: ToolLine,
    pub tool_use_id: String,
    pub tool_name: String,
    pub depth: i32,
    pub opens: bool,
    /// What the line shows when it is opened; `None` for a row made without its call.
    pub detail: Option<ToolDetail>,
    /// What a sub-agent's call shows on its card; `None` for any other tool.
    pub agent: Option<AgentSummary>,
}

/// Read-only tool calls that came one after another, shown as one line ("Explored 3 files").
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ExploredRow {
    pub key: String,
    pub members: Vec<Arc<ToolRow>>,
    pub depth: i32,
    pub opens: bool,
}

impl ExploredRow {
    pub fn lines(&self) -> Vec<&ToolLine> {
        self.members.iter().map(|it| &it.line).collect()
    }

    /// How many different files (or searches) the calls looked at: the same file read twice is
    /// one.
    pub fn files(&self) -> usize {
        self.members
            .iter()
            .map(|it| {
                it.detail
                    .as_ref()
                    .and_then(|detail| detail.target.as_deref())
                    .unwrap_or(&it.key)
            })
            .collect::<HashSet<&str>>()
            .len()
    }
}

/// The to-do list a `TodoWrite` call wrote.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct TodoRow {
    pub key: String,
    pub items: Vec<TodoItem>,
    pub opens: bool,
}

/// One to-do; `status` is the CLI's word for it (`pending`, `in_progress`, `completed`).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct TodoItem {
    pub content: String,
    pub status: String,
}

/// A card for one request of the CLI, after the message it came with.
#[derive(Clone, PartialEq, Debug)]
pub struct CardRow {
    pub key: String,
    pub card: ThreadCard,
    pub opens: bool,
}

/// The end of a turn: how long it took and what it changed (`None` until the host has looked),
/// after the turn's reply and its cards. `ask_key` is the user message the turn answered, where
/// Review and rewinding go.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct TurnEndRow {
    pub key: String,
    pub ask_key: String,
    pub duration_ms: Option<i64>,
    pub changes: Option<TurnChangesRecord>,
    /// Whether an ask the CLI knows came after this turn's: only then can the conversation be
    /// rewound to here.
    pub followed: bool,
    pub opens: bool,
}

/// After the reply that said the CLI is not signed in: how to sign in, as the `/login` it names
/// cannot run here.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SignInRow {
    pub key: String,
}

/// The tools that only read; two or more in a row fold into one [`ExploredRow`].
pub const READ_ONLY_TOOLS: [&str; 4] = ["Read", "Grep", "Glob", "LS"];

const TODO_TOOL: &str = "TodoWrite";

/// An `Arc` as a key by its address (Kotlin's `IdentityHashMap`). The key holds the `Arc`, so the
/// address cannot be freed and given to another record while the table has it.
struct ByPtr<T>(Arc<T>);

impl<T> Hash for ByPtr<T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        Arc::as_ptr(&self.0).hash(state);
    }
}

impl<T> PartialEq for ByPtr<T> {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl<T> Eq for ByPtr<T> {}

fn by_ptr<T>(it: &Arc<T>) -> ByPtr<T> {
    ByPtr(Arc::clone(it))
}

/// The approvals grouped by anchor as Kotlin's `groupBy` does: the groups in the order their
/// anchors first came, each in arrival order.
struct ByAnchor {
    groups: Vec<(Option<String>, Vec<Arc<ApprovalRecord>>)>,
    at: HashMap<Option<String>, usize>,
}

impl ByAnchor {
    fn of(approvals: &Keyed<ApprovalRecord>) -> Self {
        let mut groups: Vec<(Option<String>, Vec<Arc<ApprovalRecord>>)> = Vec::new();
        let mut at = HashMap::new();
        for approval in approvals.values() {
            let index = *at.entry(approval.anchor.clone()).or_insert_with(|| {
                groups.push((approval.anchor.clone(), Vec::new()));
                groups.len() - 1
            });
            groups[index].1.push(Arc::clone(approval));
        }
        Self { groups, at }
    }

    fn of_message(&self, key: &str) -> &[Arc<ApprovalRecord>] {
        self.at
            .get(&Some(key.to_owned()))
            .map_or(&[], |index| &self.groups[*index].1)
    }
}

/// Turns transcripts into rows, keeping the rows of every message and part that is the same `Arc`
/// as last time. The tables are only what the last [`of`](Self::of) made, built again each time.
#[derive(Default)]
pub struct ThreadRows {
    messages: HashMap<ByPtr<MessageRecord>, Vec<ThreadRow>>,
    /// `None` for a part that makes no row (a blank finished text, a block of another type).
    parts: HashMap<ByPtr<PartRecord>, Option<ThreadRow>>,
    groups: HashMap<String, Arc<ExploredRow>>,
    cards: HashMap<ByPtr<ApprovalRecord>, Arc<CardRow>>,
    ends: HashMap<String, Arc<TurnEndRow>>,
}

impl ThreadRows {
    pub fn of(&mut self, transcript: &Transcript) -> Vec<ThreadRow> {
        let mut next_messages = HashMap::new();
        let mut next_parts = HashMap::new();
        let mut next_cards = HashMap::new();
        let mut next_ends = HashMap::new();
        let mut rows = Vec::new();
        let go = plan_go_of(&transcript.operations);
        let by_anchor = ByAnchor::of(&transcript.approvals);
        let asks = sent_asks(transcript);
        let followed: HashSet<&str> = asks
            .iter()
            .take(asks.len().saturating_sub(1))
            .map(String::as_str)
            .collect();
        for message in transcript.messages.values() {
            let made = match self.messages.get(&by_ptr(message)) {
                Some(kept) => {
                    self.carry_parts(message, &mut next_parts);
                    kept.clone()
                }
                None => self.rows_of(message, &mut next_parts),
            };
            rows.extend(made.iter().cloned());
            next_messages.insert(by_ptr(message), made);
            if transcript.sign_in.as_deref() == Some(message.key.as_str()) {
                rows.push(ThreadRow::SignIn(Arc::new(SignInRow {
                    key: format!("{}/sign-in", message.key),
                })));
            }
            for approval in by_anchor.of_message(&message.key) {
                rows.push(ThreadRow::Card(self.card_row(
                    approval,
                    &mut next_cards,
                    go,
                )));
            }
            if let Some(end) = self.turn_end_row(transcript, &message.key, &followed) {
                next_ends.insert(end.key.clone(), Arc::clone(&end));
                rows.push(ThreadRow::TurnEnd(end));
            }
        }
        // A request whose message is not (or no longer) in the conversation still has to be
        // answered: it goes last.
        for (anchor, approvals) in &by_anchor.groups {
            if anchor
                .as_deref()
                .is_some_and(|it| transcript.messages.contains(it))
            {
                continue;
            }
            for approval in approvals {
                rows.push(ThreadRow::Card(self.card_row(
                    approval,
                    &mut next_cards,
                    go,
                )));
            }
        }
        self.messages = next_messages;
        self.parts = next_parts;
        self.cards = next_cards;
        self.ends = next_ends;
        self.grouped(rows)
    }

    fn turn_end_row(
        &self,
        transcript: &Transcript,
        message_key: &str,
        followed: &HashSet<&str>,
    ) -> Option<Arc<TurnEndRow>> {
        let end = transcript.turn_ends.get(message_key)?;
        let ask_key = end.ask_key.as_ref()?;
        let made = TurnEndRow {
            key: format!("{message_key}/end"),
            ask_key: ask_key.clone(),
            duration_ms: end.duration_ms,
            changes: transcript.turn_changes.get(ask_key).cloned(),
            followed: followed.contains(ask_key.as_str()),
            opens: false,
        };
        match self.ends.get(&made.key) {
            Some(kept) if **kept == made => Some(Arc::clone(kept)),
            _ => Some(Arc::new(made)),
        }
    }

    fn card_row(
        &self,
        approval: &Arc<ApprovalRecord>,
        into: &mut HashMap<ByPtr<ApprovalRecord>, Arc<CardRow>>,
        go: PlanGo,
    ) -> Arc<CardRow> {
        let kept = self
            .cards
            .get(&by_ptr(approval))
            .filter(|it| match &it.card {
                ThreadCard::Plan(plan) => plan.go == go,
                _ => true,
            });
        let made = match kept {
            Some(kept) => Arc::clone(kept),
            None => Arc::new(CardRow {
                key: card_key(approval),
                card: card_of(approval, go),
                opens: false,
            }),
        };
        into.insert(by_ptr(approval), Arc::clone(&made));
        made
    }

    /// A message kept whole keeps its parts' rows too, so they are found again once the message
    /// changes.
    fn carry_parts(
        &self,
        message: &MessageRecord,
        into: &mut HashMap<ByPtr<PartRecord>, Option<ThreadRow>>,
    ) {
        for part in message.parts.values() {
            let key = by_ptr(part);
            if let Some(row) = self.parts.get(&key) {
                into.insert(key, row.clone());
            }
        }
    }

    fn rows_of(
        &self,
        message: &MessageRecord,
        into: &mut HashMap<ByPtr<PartRecord>, Option<ThreadRow>>,
    ) -> Vec<ThreadRow> {
        if message.role == Role::User {
            let words: Vec<&str> = message
                .parts
                .values()
                .filter_map(|part| match part.as_ref() {
                    PartRecord::Text(text) => Some(text.text.as_str()),
                    _ => None,
                })
                .collect();
            let attachments = message
                .parts
                .values()
                .filter_map(|part| match part.as_ref() {
                    PartRecord::Attachment(it) => Some(it.clone()),
                    _ => None,
                })
                .collect();
            return vec![ThreadRow::Ask(Arc::new(AskRow {
                key: message.key.clone(),
                text: words.join("\n"),
                attachments,
            }))];
        }
        let mut rows = Vec::new();
        for part_key in message.parts.order() {
            let Some(part) = message.parts.get(part_key) else {
                continue;
            };
            let key = by_ptr(part);
            let made = match self.parts.get(&key) {
                Some(kept) => kept.clone(),
                None => row_of(format!("{}/{part_key}", message.key), part, rows.is_empty()),
            };
            if let Some(row) = &made {
                rows.push(row.clone());
            }
            into.insert(key, made);
        }
        rows
    }

    /// Folds each run of two or more read-only tool rows into one [`ExploredRow`], the same `Arc`
    /// while its run is.
    fn grouped(&mut self, rows: Vec<ThreadRow>) -> Vec<ThreadRow> {
        let mut out = Vec::with_capacity(rows.len());
        let mut next_groups = HashMap::new();
        let mut i = 0;
        while i < rows.len() {
            let mut members = Vec::new();
            while let Some(ThreadRow::Tool(tool)) = rows.get(i + members.len())
                && READ_ONLY_TOOLS.contains(&tool.tool_name.as_str())
            {
                members.push(Arc::clone(tool));
            }
            if members.len() >= 2 {
                i += members.len();
                let group = match self.same_group(&members) {
                    Some(old) => old,
                    None => Arc::new(ExploredRow {
                        key: members[0].key.clone(),
                        depth: members[0].depth,
                        opens: members[0].opens,
                        members,
                    }),
                };
                next_groups.insert(group.key.clone(), Arc::clone(&group));
                out.push(ThreadRow::Explored(group));
            } else {
                out.push(rows[i].clone());
                i += 1;
            }
        }
        self.groups = next_groups;
        out
    }

    fn same_group(&self, members: &[Arc<ToolRow>]) -> Option<Arc<ExploredRow>> {
        let old = self.groups.get(&members[0].key)?;
        let same = old.members.len() == members.len()
            && old
                .members
                .iter()
                .zip(members)
                .all(|(a, b)| Arc::ptr_eq(a, b));
        same.then(|| Arc::clone(old))
    }
}

fn card_key(approval: &ApprovalRecord) -> String {
    match &approval.anchor {
        None => format!("card:{}", approval.request_id),
        Some(anchor) => format!("{anchor}/card:{}", approval.request_id),
    }
}

fn row_of(key: String, part: &PartRecord, opens: bool) -> Option<ThreadRow> {
    match part {
        PartRecord::Text(text) if text.reasoning => {
            Some(ThreadRow::Thinking(Arc::new(ThinkingRow {
                key,
                text: text.text.clone(),
                streaming: text.streaming,
                opens,
            })))
        }
        PartRecord::Text(text) if kt_is_blank(&text.text) && !text.streaming => None,
        PartRecord::Text(text) => Some(ThreadRow::Text(Arc::new(TextRow {
            key,
            markdown: text.text.clone(),
            streaming: text.streaming,
            opens,
        }))),
        PartRecord::ToolCall(call) if call.tool_name == TODO_TOOL => {
            Some(ThreadRow::Todo(Arc::new(TodoRow {
                key,
                items: todos_of(call.input.as_deref()),
                opens,
            })))
        }
        PartRecord::ToolCall(call) => Some(ThreadRow::Tool(Arc::new(ToolRow {
            key,
            line: tool_line(call),
            tool_use_id: call.tool_use_id.clone(),
            tool_name: call.tool_name.clone(),
            depth: 0,
            opens,
            detail: Some(tool_detail(call)),
            agent: agent_summary(call),
        }))),
        PartRecord::Other(_) | PartRecord::Attachment(_) => None,
    }
}

fn todos_of(input: Option<&Value>) -> Vec<TodoItem> {
    let Some(todos) = input
        .and_then(Value::as_object)
        .and_then(|it| it.array("todos"))
    else {
        return Vec::new();
    };
    todos
        .iter()
        .filter_map(|item| {
            let todo = item.as_object()?;
            Some(TodoItem {
                content: todo.string("content")?.to_owned(),
                status: todo.string("status").unwrap_or("pending").to_owned(),
            })
        })
        .collect()
}

/// The rows of the sub-agent the call `tool_use_id` started: its own messages, by the same rules
/// as the main thread.
pub fn agent_rows(transcript: &Transcript, tool_use_id: &str) -> Vec<ThreadRow> {
    agent_transcript(transcript, tool_use_id)
        .map(|it| ThreadRows::default().of(&it))
        .unwrap_or_default()
}

/// The sub-agent's own conversation, for a tab that keeps its own [`ThreadRows`] (so unchanged
/// rows stay the same).
pub fn agent_transcript(transcript: &Transcript, tool_use_id: &str) -> Option<Transcript> {
    find_call(&transcript.messages, tool_use_id).map(|call| Transcript {
        messages: call.messages.clone(),
        ..Transcript::default()
    })
}

/// The call `tool_use_id`, depth first: each call before the calls inside it, and those before the
/// next call.
fn find_call<'a>(
    messages: &'a Keyed<MessageRecord>,
    tool_use_id: &str,
) -> Option<&'a ToolCallRecord> {
    messages
        .values()
        .flat_map(|message| message.parts.values())
        .filter_map(|part| match part.as_ref() {
            PartRecord::ToolCall(call) => Some(call),
            _ => None,
        })
        .find_map(|call| {
            if call.tool_use_id == tool_use_id {
                Some(call)
            } else {
                find_call(&call.messages, tool_use_id)
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcript::{MessageSource, TextRecord};

    fn text(words: &str) -> Arc<PartRecord> {
        Arc::new(PartRecord::Text(TextRecord {
            text: words.into(),
            ..TextRecord::default()
        }))
    }

    fn with(parts: Keyed<PartRecord>) -> Transcript {
        let message = MessageRecord {
            key: "m".into(),
            role: Role::Assistant,
            source: MessageSource::Nested,
            parts,
        };
        Transcript {
            messages: Keyed::new().put("m".into(), Arc::new(message)),
            ..Transcript::default()
        }
    }

    // No row is drawn for it either way, so only the table shows that it was looked at once and
    // that a reused message carries it on.
    #[test]
    fn a_blank_part_is_remembered_as_making_no_row() {
        let blank = text(" \n\t");
        let parts = Keyed::new()
            .put("b".into(), Arc::clone(&blank))
            .put("t".into(), text("words"));
        let first = with(parts.clone());
        let mut rows = ThreadRows::default();

        let made = rows.of(&first);
        assert_eq!(
            vec!["m/t"],
            made.iter().map(ThreadRow::key).collect::<Vec<_>>()
        );
        assert!(made[0].opens(), "the first row of the message opens it");
        assert_eq!(Some(&None), rows.parts.get(&by_ptr(&blank)));

        rows.of(&first);
        assert_eq!(Some(&None), rows.parts.get(&by_ptr(&blank)), "carried");

        let grown = rows.of(&with(parts.put("u".into(), text("more"))));
        assert_eq!(
            vec!["m/t", "m/u"],
            grown.iter().map(ThreadRow::key).collect::<Vec<_>>()
        );
        assert_eq!(Some(&None), rows.parts.get(&by_ptr(&blank)));
    }
}
