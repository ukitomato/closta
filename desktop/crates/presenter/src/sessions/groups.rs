//! How the sessions list groups a session, and which notifications a change of its view raises
//! (SessionGroups.kt). The screen and the notifications only show these.

use std::collections::HashSet;
use std::fmt;
use std::sync::Arc;

use closta_model::ConversationState;
use serde_json::Value;

use crate::cards::plan::{PLAN_TOOL, PlanGo, plan_go_of};
use crate::cards::{PermissionCard, ThreadCard, card_of};
use crate::text::{kt_is_blank, kt_lines, kt_trim, take_utf16, utf16_len};
use crate::thread_running::thread_is_running;
use crate::transcript::{ApprovalRecord, PartRecord, Role, Transcript};

/// A session's place in the sessions list; the list shows the groups in this order.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum SessionGroup {
    Waiting,
    Running,
    Unread,
    Other,
}

/// `reason` is what a waiting session waits for; `None` for the other groups.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SessionSummary {
    pub group: SessionGroup,
    pub reason: Option<WaitReason>,
}

/// What a waiting session waits for; the screen puts it into words.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum WaitReason {
    Question,
    Plan,
    /// A tool's permission; `subject` is the start of what it acts on, when there is one.
    Permission {
        tool_name: String,
        subject: Option<String>,
    },
    Other,
}

pub fn session_summary(
    conversation: &ConversationState,
    transcript: &Transcript,
    unread: bool,
) -> SessionSummary {
    let (group, reason) = match waiting_approvals(conversation, transcript).first() {
        Some(first) => (
            SessionGroup::Waiting,
            Some(reason_of(first, plan_go_of(&transcript.operations))),
        ),
        None if thread_is_running(conversation, transcript) => (SessionGroup::Running, None),
        None if unread => (SessionGroup::Unread, None),
        None => (SessionGroup::Other, None),
    };
    SessionSummary { group, reason }
}

/// Something to tell the user about a session they do not see; its key names its notification.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum SessionAlert {
    Permission(PermissionAlert),
    OpenOnly(OpenOnlyAlert),
    Finished(FinishedAlert),
}

impl SessionAlert {
    pub fn key(&self) -> &str {
        match self {
            Self::Permission(alert) => &alert.key,
            Self::OpenOnly(alert) => &alert.key,
            Self::Finished(alert) => &alert.key,
        }
    }
}

/// A tool waits for a yes or no that can be given from the notification. `subject` may be shown:
/// the start of a command, or a file name.
#[derive(Clone, PartialEq, Eq)]
pub struct PermissionAlert {
    pub key: String,
    pub request_id: String,
    pub tool_name: String,
    pub subject: String,
    pub answerable: bool,
}

/// The subject is the user's command or file: `Debug` gives only its length.
impl fmt::Debug for PermissionAlert {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PermissionAlert")
            .field("key", &self.key)
            .field("request_id", &self.request_id)
            .field("tool_name", &self.tool_name)
            .field("subject_len", &self.subject.len())
            .field("answerable", &self.answerable)
            .finish()
    }
}

/// Something to read before answering: the notification only opens the session.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct OpenOnlyAlert {
    pub key: String,
    pub request_id: String,
    pub what: AlertKind,
}

/// A turn ended.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct FinishedAlert {
    pub key: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum AlertKind {
    Plan,
    Question,
    Edit,
}

/// The notifications to raise, and the keys of those to take back.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct AlertChange {
    pub raised: Vec<SessionAlert>,
    pub expired: Vec<String>,
}

/// What changed between two views of one session: an alert for each approval that has begun to
/// wait, the key of each that no longer waits, and a [`FinishedAlert`] when the session stopped
/// running. `before` is `None` the first time the session is seen: whatever waits then is raised
/// (a resumed session's too), and nothing is said to have finished.
pub fn alerts_between(
    before: Option<(&ConversationState, &Transcript)>,
    after: (&ConversationState, &Transcript),
) -> AlertChange {
    let now = waiting_approvals(after.0, after.1);
    let then = before.map_or_else(Vec::new, |(conversation, transcript)| {
        waiting_approvals(conversation, transcript)
    });
    let then_ids: HashSet<&str> = then.iter().map(|it| it.request_id.as_str()).collect();
    let now_ids: HashSet<&str> = now.iter().map(|it| it.request_id.as_str()).collect();
    let go = plan_go_of(&after.1.operations);
    let mut raised: Vec<SessionAlert> = now
        .iter()
        .filter(|it| !then_ids.contains(it.request_id.as_str()))
        .map(|it| alert_of(it, go))
        .collect();
    let finished = before.is_some_and(|(conversation, transcript)| {
        thread_is_running(conversation, transcript) && !thread_is_running(after.0, after.1)
    });
    if finished {
        raised.push(SessionAlert::Finished(FinishedAlert {
            key: format!("{FINISHED}{}", after.0.turns.len()),
        }));
    }
    let expired = then
        .iter()
        .filter(|it| !now_ids.contains(it.request_id.as_str()))
        .map(|it| it.request_id.clone())
        .collect();
    AlertChange { raised, expired }
}

/// What a session waits for, as alerts, in arrival order.
pub fn waiting_alerts(
    conversation: &ConversationState,
    transcript: &Transcript,
) -> Vec<SessionAlert> {
    let go = plan_go_of(&transcript.operations);
    waiting_approvals(conversation, transcript)
        .iter()
        .map(|record| alert_of(record, go))
        .collect()
}

const FINISHED: &str = "finished:";
const EDIT_TOOLS: [&str; 4] = ["Edit", "Write", "MultiEdit", "NotebookEdit"];
const READ_TOOL: &str = "Read";
const COMMAND_TOOLS: [&str; 1] = ["Bash"];
const REASON_SUBJECT: usize = 40;
const ALERT_SUBJECT: usize = 80;

fn is_file_tool(tool: &str) -> bool {
    EDIT_TOOLS.contains(&tool) || tool == READ_TOOL
}

/// The approvals and questions that wait, in arrival order: those core holds as pending and the
/// transcript recorded.
pub(crate) fn waiting_approvals(
    conversation: &ConversationState,
    transcript: &Transcript,
) -> Vec<Arc<ApprovalRecord>> {
    conversation
        .pending_approvals
        .iter()
        .filter(|it| !it.request_id.is_empty())
        .filter_map(|it| transcript.approvals.get(&it.request_id).cloned())
        .collect()
}

fn reason_of(record: &ApprovalRecord, go: PlanGo) -> WaitReason {
    match card_of(record, go) {
        ThreadCard::Question(_) => WaitReason::Question,
        _ if record.tool_name.as_deref() == Some(PLAN_TOOL) => WaitReason::Plan,
        ThreadCard::Permission(card) => WaitReason::Permission {
            subject: card
                .subject
                .as_deref()
                .map(|it| take_utf16(it, REASON_SUBJECT).to_owned()),
            tool_name: card.tool_name,
        },
        ThreadCard::Plan(_) => WaitReason::Other,
    }
}

fn alert_of(record: &ApprovalRecord, go: PlanGo) -> SessionAlert {
    let open_only = |what| {
        SessionAlert::OpenOnly(OpenOnlyAlert {
            key: record.request_id.clone(),
            request_id: record.request_id.clone(),
            what,
        })
    };
    let tool = record.tool_name.as_deref();
    match card_of(record, go) {
        ThreadCard::Question(_) => open_only(AlertKind::Question),
        _ if tool == Some(PLAN_TOOL) => open_only(AlertKind::Plan),
        _ if tool.is_some_and(|it| EDIT_TOOLS.contains(&it)) => open_only(AlertKind::Edit),
        ThreadCard::Permission(card) => {
            SessionAlert::Permission(permission_alert_of(record, Some(&card)))
        }
        ThreadCard::Plan(_) => SessionAlert::Permission(permission_alert_of(record, None)),
    }
}

fn permission_alert_of(
    record: &ApprovalRecord,
    permission: Option<&PermissionCard>,
) -> PermissionAlert {
    let id = &record.request_id;
    let tool = permission.map_or_else(
        || record.tool_name.clone().unwrap_or_default(),
        |it| it.tool_name.clone(),
    );
    let subject = permission
        .and_then(|it| it.subject.as_deref())
        .unwrap_or_default();
    let clean = permission.is_some_and(|it| !it.hidden_marked && it.input_fields.is_empty());
    // Only the start of a command or a file's path may be shown; another tool's input (a URL, a
    // pattern, a prompt, an MCP argument) is not. Allow is offered only when what is shown is all
    // of the input: a Bash command that fits on one line, a Read with a path alone that fits
    // whole. A path that cannot be allowed shows its folder and name.
    let (shown, whole) = if COMMAND_TOOLS.contains(&tool.as_str()) {
        (
            take_utf16(subject, ALERT_SUBJECT).to_owned(),
            clean
                && !subject.is_empty()
                && !permission.is_some_and(|it| it.sandbox_off)
                && !subject.contains('\n')
                && utf16_len(subject) <= ALERT_SUBJECT,
        )
    } else if is_file_tool(&tool) {
        file_subject(subject, clean && tool == READ_TOOL && path_only(record))
    } else {
        (String::new(), false)
    };
    PermissionAlert {
        key: id.clone(),
        request_id: id.clone(),
        tool_name: tool,
        subject: take_utf16(&shown, ALERT_SUBJECT).to_owned(),
        answerable: whole,
    }
}

// A path that may be allowed and fits is shown whole; any other shows its folder and name.
fn file_subject(path: &str, may_allow: bool) -> (String, bool) {
    if may_allow && utf16_len(path) <= ALERT_SUBJECT {
        (path.to_owned(), true)
    } else {
        (last_segments(path), false)
    }
}

// A Read card lists no fields, so the request itself says whether it holds more than the path.
fn path_only(record: &ApprovalRecord) -> bool {
    record
        .input
        .as_deref()
        .and_then(Value::as_object)
        .is_some_and(|input| {
            input.keys().eq(["file_path"])
                && input
                    .get("file_path")
                    .and_then(Value::as_str)
                    .is_some_and(|it| !it.is_empty())
        })
}

fn last_segments(path: &str) -> String {
    let segments: Vec<&str> = path
        .split(['/', '\\'])
        .filter(|it| !it.is_empty())
        .collect();
    segments[segments.len().saturating_sub(2)..].join("/")
}

/// How long a session's name in the sessions list may be, in UTF-16 units.
pub const TITLE_MAX: usize = 60;

/// A session's name in the sessions list: the first line of the user's first request, cut short;
/// `None` before one.
pub fn session_title(transcript: &Transcript) -> Option<String> {
    let first_request = transcript
        .messages
        .values()
        .find(|message| message.role == Role::User)?;
    let line = first_request
        .parts
        .values()
        .find_map(|part| match &**part {
            PartRecord::Text(text) => kt_lines(&text.text).find(|it| !kt_is_blank(it)),
            _ => None,
        })?;
    Some(take_utf16(kt_trim(line), TITLE_MAX).to_owned())
}

#[cfg(test)]
mod tests {
    use super::{AlertChange, PermissionAlert, SessionAlert};

    #[test]
    fn debug_names_the_ids_and_the_kind_but_not_the_subject() {
        let alert = PermissionAlert {
            key: "k1".to_owned(),
            request_id: "r1".to_owned(),
            tool_name: "Bash".to_owned(),
            subject: "SECRET-COMMAND".to_owned(),
            answerable: true,
        };
        let change = AlertChange {
            raised: vec![SessionAlert::Permission(alert.clone())],
            expired: Vec::new(),
        };
        for text in [format!("{alert:?}"), format!("{change:?}")] {
            assert!(!text.contains("SECRET"), "{text}");
            assert!(text.contains("r1") && text.contains("Bash"), "{text}");
            assert!(text.contains("14"), "the subject's length: {text}");
        }
    }
}
