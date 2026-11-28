//! The conversation as rows, the unit a lazy list draws: one row per user message, per text or
//! thinking block, per tool call (ThreadRows.kt, and `agentRows` of RunningTasks.kt). A row says
//! what to draw and nothing of how. Rows of a record that did not change are the same `Arc`s as
//! before ([`ThreadRow::same`]), which is how a surface knows what it may leave alone.

use std::collections::{HashMap, HashSet};
use std::fmt;
use std::hash::{Hash, Hasher};
use std::sync::Arc;

use serde_json::Value;

use crate::cards::plan::{PlanGo, plan_go_of};
use crate::cards::{ThreadCard, card_of};
use crate::json::JsonFields;
use crate::keyed::Keyed;
use crate::records::attachment::AttachmentRecord;
use crate::records::turn_end::TurnChangesRecord;
use crate::rewind_targets::live_asks;
use crate::text::kt_is_blank;
use crate::tool_line::{
    AgentSummary, ToolDetail, ToolLine, ToolLineState, agent_summary, result_text, tool_detail,
    tool_line,
};
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
    Divider(Arc<DividerRow>),
    Notice(Arc<NoticeRow>),
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
            Self::Divider(row) => &row.key,
            Self::Notice(row) => &row.key,
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
            Self::Divider(row) => row.opens,
            Self::Notice(row) => row.opens,
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
            (Self::Divider(a), Self::Divider(b)) => Arc::ptr_eq(a, b),
            (Self::Notice(a), Self::Notice(b)) => Arc::ptr_eq(a, b),
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
    /// Whether the session refused to send it.
    pub not_sent: bool,
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

    /// The one state the folded line shows: a failure first, then a refusal, then a call still
    /// running; done when all are.
    pub fn state(&self) -> ToolLineState {
        let has = |state: ToolLineState| self.members.iter().any(|it| it.line.state == state);
        [
            ToolLineState::Error,
            ToolLineState::Denied,
            ToolLineState::Running,
        ]
        .into_iter()
        .find(|it| has(*it))
        .unwrap_or(ToolLineState::Ok)
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

/// The to-do list a `TodoWrite` call wrote, or a run of `TaskCreate` and `TaskUpdate` calls left.
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

/// A line across the thread where the conversation changed under it; what came before stays
/// above it.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct DividerRow {
    pub key: String,
    pub divider: Divider,
    pub opens: bool,
}

/// What a [`DividerRow`] marks.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Divider {
    /// The conversation was cleared; `at` is when, as the CLI wrote it (ISO 8601, UTC), `None`
    /// when it did not say.
    Cleared { at: Option<String> },
    /// The conversation was compacted (or failed to be): what started it, the tokens before and,
    /// when the CLI said, after ([`CompactedRecord`](crate::transcript::CompactedRecord)).
    Compacted {
        trigger: String,
        pre_tokens: i64,
        post_tokens: Option<i64>,
        failed: bool,
    },
}

/// What an [`InformationalRecord`](crate::transcript::InformationalRecord) says of its level, as
/// the CLI draws it: grey, or more prominent.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum NoticeLevel {
    Notice,
    Suggestion,
    Warning,
}

/// The CLI's `suggestion` and `warning` are prominent; `notice` and any level not known are the
/// quiet one.
pub fn notice_level_of(level: &str) -> NoticeLevel {
    match level {
        "suggestion" => NoticeLevel::Suggestion,
        "warning" => NoticeLevel::Warning,
        _ => NoticeLevel::Notice,
    }
}

/// A line of the CLI's own (`content`); `stopped` when the CLI did not go on after it. `Debug`
/// shows the level and the length of `content`, never its words.
#[derive(Clone, PartialEq, Eq)]
pub struct NoticeRow {
    pub key: String,
    pub level: NoticeLevel,
    pub content: String,
    pub stopped: bool,
    pub opens: bool,
}

impl fmt::Debug for NoticeRow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "NoticeRow({:?}, {} bytes{})",
            self.level,
            self.content.len(),
            if self.stopped { ", stopped" } else { "" }
        )
    }
}

/// The tools that only read; two or more in a row fold into one [`ExploredRow`].
pub const READ_ONLY_TOOLS: [&str; 4] = ["Read", "Grep", "Glob", "LS"];

const TODO_TOOL: &str = "TodoWrite";
const TASK_CREATE: &str = "TaskCreate";
const TASK_UPDATE: &str = "TaskUpdate";

fn is_task_tool(name: &str) -> bool {
    name == TASK_CREATE || name == TASK_UPDATE
}

fn is_task_row(row: &ThreadRow) -> bool {
    matches!(row, ThreadRow::Tool(tool) if is_task_tool(&tool.tool_name))
}

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
    tasks: TaskTodos,
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
        let asks = live_asks(transcript);
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
                None => self.rows_of(
                    message,
                    transcript.not_sent.contains(&message.key),
                    &mut next_parts,
                ),
            };
            rows.extend(made.iter().cloned());
            next_messages.insert(by_ptr(message), made);
            if transcript.sign_in.as_deref() == Some(message.key.as_str()) {
                // Rebuilt on every `of`, as Kotlin builds a new data class each time.
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
        let grouped = self.grouped(rows);
        self.tasks.folded(grouped, transcript)
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
        not_sent: bool,
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
                not_sent,
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
        PartRecord::Cleared(cleared) => Some(ThreadRow::Divider(Arc::new(DividerRow {
            key,
            divider: Divider::Cleared {
                at: cleared.at.clone(),
            },
            opens,
        }))),
        PartRecord::Compacted(compacted) => Some(ThreadRow::Divider(Arc::new(DividerRow {
            key,
            divider: Divider::Compacted {
                trigger: compacted.trigger.clone(),
                pre_tokens: compacted.pre_tokens,
                post_tokens: compacted.post_tokens,
                failed: compacted.failed,
            },
            opens,
        }))),
        PartRecord::Informational(notice) => Some(ThreadRow::Notice(Arc::new(NoticeRow {
            key,
            level: notice_level_of(&notice.level),
            content: notice.content.clone(),
            stopped: notice.stopped,
            opens,
        }))),
        PartRecord::Other(_) | PartRecord::Attachment(_) => None,
    }
}

/// Replaces the task calls' tool rows with the to-do list they build, one list per run of calls
/// with nothing between them. The list starts empty and again after each `/clear`; a list that
/// did not change is the same `Arc` as before. A run that leaves no task draws nothing, not even
/// its tool rows. A message that is the same `Arc` as at the last read keeps the task calls found
/// in it then (Kotlin's `callsOf`).
#[derive(Default)]
struct TaskTodos {
    lists: HashMap<String, Arc<TodoRow>>,
    calls_of: HashMap<String, MessageTaskCalls>,
}

/// A message as last read, and the parts of it that are task calls.
struct MessageTaskCalls {
    message: Arc<MessageRecord>,
    calls: Vec<Arc<PartRecord>>,
}

impl TaskTodos {
    fn folded(&mut self, rows: Vec<ThreadRow>, transcript: &Transcript) -> Vec<ThreadRow> {
        if !rows.iter().any(is_task_row) {
            self.lists = HashMap::new();
            self.calls_of = HashMap::new();
            return rows;
        }
        let calls_of = self.task_calls_of(transcript);
        let calls = task_calls(transcript, &calls_of);
        let mut out = Vec::with_capacity(rows.len());
        let mut next_lists = HashMap::new();
        let mut board = TaskBoard::default();
        let mut first: Option<bool> = None;
        for (index, row) in rows.iter().enumerate() {
            if let ThreadRow::Divider(it) = row
                && matches!(it.divider, Divider::Cleared { .. })
            {
                board.clear();
            }
            let ThreadRow::Tool(tool) = row else {
                out.push(row.clone());
                continue;
            };
            if !is_task_tool(&tool.tool_name) {
                out.push(row.clone());
                continue;
            }
            let opening = first.unwrap_or(tool.opens);
            if let Some(call) = calls.get(tool.tool_use_id.as_str()) {
                board.apply(call);
            }
            let run_goes_on = rows.get(index + 1).is_some_and(is_task_row);
            first = run_goes_on.then_some(opening);
            if !run_goes_on {
                let items = board.items();
                if items.is_empty() {
                    continue;
                }
                let made = TodoRow {
                    key: tool.key.clone(),
                    items,
                    opens: opening,
                };
                let list = match self.lists.get(&made.key) {
                    Some(kept) if **kept == made => Arc::clone(kept),
                    _ => Arc::new(made),
                };
                next_lists.insert(list.key.clone(), Arc::clone(&list));
                out.push(ThreadRow::Todo(list));
            }
        }
        self.lists = next_lists;
        drop(calls);
        self.calls_of = calls_of;
        out
    }

    /// Each of the thread's own messages with its task calls, found again only in a message that
    /// is not the `Arc` it was at the last read.
    fn task_calls_of(&mut self, transcript: &Transcript) -> HashMap<String, MessageTaskCalls> {
        transcript
            .messages
            .values()
            .map(|message| {
                let kept = self
                    .calls_of
                    .remove(&message.key)
                    .filter(|it| Arc::ptr_eq(&it.message, message));
                let found = kept.unwrap_or_else(|| MessageTaskCalls {
                    message: Arc::clone(message),
                    calls: message
                        .parts
                        .values()
                        .filter(|part| {
                            matches!(part.as_ref(), PartRecord::ToolCall(call) if is_task_tool(&call.tool_name))
                        })
                        .cloned()
                        .collect(),
                });
                (message.key.clone(), found)
            })
            .collect()
    }
}

/// The task calls of the thread's own messages by their tool use id: a row kept from before holds
/// no call.
fn task_calls<'a>(
    transcript: &Transcript,
    calls_of: &'a HashMap<String, MessageTaskCalls>,
) -> HashMap<&'a str, &'a ToolCallRecord> {
    transcript
        .messages
        .values()
        .filter_map(|message| calls_of.get(&message.key))
        .flat_map(|it| it.calls.iter())
        .filter_map(|part| match part.as_ref() {
            PartRecord::ToolCall(call) => Some((call.tool_use_id.as_str(), call)),
            _ => None,
        })
        .collect()
}

/// What a `TaskCreate` result says first (`Task #1 created successfully: write tests`): the
/// number after `Task #` of the first place that reads `Task #<digits> created`.
fn task_created(text: &str) -> Option<&str> {
    const HEAD: &str = "Task #";
    text.match_indices(HEAD).find_map(|(at, _)| {
        let rest = &text[at + HEAD.len()..];
        let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
        (digits > 0 && rest[digits..].starts_with(" created")).then(|| &rest[..digits])
    })
}

/// The tasks as the calls so far left them, by id, in the order they were created. A create not
/// yet answered takes the number after the largest so far, the one the CLI gives next; if an
/// answer later names that number, the unanswered one moves on to the next free number, so two
/// tasks never share an id.
#[derive(Default)]
struct TaskBoard {
    items: Vec<(String, TodoItem)>,
    unanswered: HashSet<String>,
}

impl TaskBoard {
    fn clear(&mut self) {
        self.items.clear();
        self.unanswered.clear();
    }

    fn items(&self) -> Vec<TodoItem> {
        self.items.iter().map(|(_, item)| item.clone()).collect()
    }

    fn apply(&mut self, call: &ToolCallRecord) {
        let Some(input) = call.input.as_deref().and_then(Value::as_object) else {
            return;
        };
        if call.tool_name == TASK_CREATE {
            self.create(call, input);
        } else {
            self.update(input);
        }
    }

    fn create(&mut self, call: &ToolCallRecord, input: &serde_json::Map<String, Value>) {
        let Some(subject) = input.string("subject") else {
            return;
        };
        let item = TodoItem {
            content: subject.to_owned(),
            status: "pending".to_owned(),
        };
        let said = call
            .result
            .as_ref()
            .and_then(|result| result.content.as_deref())
            .and_then(|content| task_created(&result_text(content)).map(str::to_owned));
        let Some(said) = said else {
            let id = self.next_id();
            self.unanswered.insert(id.clone());
            self.put(id, item);
            return;
        };
        if self.unanswered.contains(&said) {
            self.move_on(&said);
        }
        self.put(said, item);
    }

    /// Sets the task `id`, keeping its place when the list holds it.
    fn put(&mut self, id: String, item: TodoItem) {
        match self.items.iter_mut().find(|(key, _)| *key == id) {
            Some(slot) => slot.1 = item,
            None => self.items.push((id, item)),
        }
    }

    fn next_id(&self) -> String {
        let largest = self
            .items
            .iter()
            .filter_map(|(key, _)| key.parse::<i64>().ok())
            .max()
            .unwrap_or(0);
        (largest + 1).to_string()
    }

    /// Gives the unanswered task `id` the next free number, keeping its place in the list.
    fn move_on(&mut self, id: &str) {
        let moved = self.next_id();
        self.unanswered.remove(id);
        self.unanswered.insert(moved.clone());
        for (key, _) in &mut self.items {
            if key == id {
                key.clone_from(&moved);
            }
        }
    }

    /// An update of a task this list does not hold changes nothing.
    fn update(&mut self, input: &serde_json::Map<String, Value>) {
        let id = match input.get("taskId") {
            Some(Value::String(text)) => text.clone(),
            Some(Value::Number(number)) => number.to_string(),
            _ => return,
        };
        let Some(at) = self.items.iter().position(|(key, _)| *key == id) else {
            return;
        };
        let status = input.string("status");
        if status == Some("deleted") {
            self.items.remove(at);
        } else {
            let item = &mut self.items[at].1;
            if let Some(subject) = input.string("subject") {
                subject.clone_into(&mut item.content);
            }
            if let Some(status) = status {
                status.clone_into(&mut item.status);
            }
        }
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

    fn explored_of(states: &[ToolLineState]) -> ExploredRow {
        let members = states
            .iter()
            .enumerate()
            .map(|(n, state)| {
                Arc::new(ToolRow {
                    key: format!("t{n}"),
                    line: ToolLine {
                        state: *state,
                        label: "Read(a.rs)".into(),
                        added: None,
                        removed: None,
                        denial: None,
                    },
                    tool_use_id: format!("t{n}"),
                    tool_name: "Read".into(),
                    depth: 0,
                    opens: false,
                    detail: None,
                    agent: None,
                })
            })
            .collect();
        ExploredRow {
            key: "t0".into(),
            members,
            depth: 0,
            opens: false,
        }
    }

    // The words are the CLI's and may say anything: a log shows the level and the length.
    #[test]
    fn a_notice_rows_debug_shows_its_level_not_its_words() {
        let row = NoticeRow {
            key: "m/notice".into(),
            level: NoticeLevel::Warning,
            content: "secret words".into(),
            stopped: true,
            opens: false,
        };

        let shown = format!("{row:?}");

        assert!(shown.contains("Warning"), "{shown}");
        assert!(!shown.contains("secret words"), "{shown}");
    }

    // ThreadViews.kt's explored line: a failure first, then a refusal, then one still running.
    #[test]
    fn an_explored_row_is_failed_then_denied_then_running_then_done() {
        use ToolLineState::{Denied, Error, Ok, Running};
        for (states, expected) in [
            (vec![Ok, Denied, Error, Running], Error),
            (vec![Ok, Running, Denied], Denied),
            (vec![Ok, Running], Running),
            (vec![Ok, Ok], Ok),
        ] {
            assert_eq!(expected, explored_of(&states).state(), "{states:?}");
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
