//! What the CLI asked the user, drawn as a card in the conversation (never as a dialog in the
//! middle of the screen), and what answering a card sends (ThreadCards.kt).

pub mod decisions;
pub mod plan;

use std::sync::Arc;

use serde_json::{Map, Value};

use crate::edit_diff::{EditDiff, edit_diff};
use crate::input::PassedOn;
use crate::json::{JsonFields, compact, parse};
use crate::transcript::{ApprovalOutcome, ApprovalRecord, SuggestionRecord};
use crate::visible::{VisibleText, visible};

use self::plan::{PLAN_TOOL, PlanCard, PlanGo, plan_card_of};

/// A card for one request of the CLI.
#[derive(Clone, PartialEq, Debug)]
pub enum ThreadCard {
    Permission(PermissionCard),
    Question(QuestionCard),
    Plan(PlanCard),
}

impl ThreadCard {
    pub fn request_id(&self) -> &str {
        match self {
            Self::Permission(card) => &card.request_id,
            Self::Question(card) => &card.request_id,
            Self::Plan(card) => &card.request_id,
        }
    }

    /// How it was answered; `None` while it waits.
    pub fn answered(&self) -> Option<ApprovalOutcome> {
        match self {
            Self::Permission(card) => card.answered,
            Self::Question(card) => card.answered,
            Self::Plan(card) => card.answered,
        }
    }
}

/// A tool the CLI asks to run. `subject` is what it would run on: a command or a file, whole, or
/// for another tool the first string of its input. `failure` is the sentence for an answer that
/// could not be passed on.
#[derive(Clone, PartialEq, Debug)]
pub struct PermissionCard {
    pub request_id: String,
    pub tool_name: String,
    pub subject: Option<String>,
    pub suggestions: Arc<[SuggestionRecord]>,
    pub answered: Option<ApprovalOutcome>,
    pub failure: Option<String>,
    /// The change an `Edit` or `Write` asks to make, as a small diff; `None` for any other tool.
    pub diff: Option<EditDiff>,
    /// The input's keys and values besides `subject`: every key for another tool, every key but
    /// `command` and `description` for Bash, every key but the path for MultiEdit and
    /// NotebookEdit; none for Edit and Write (their `diff` shows the change) and Read.
    pub input_fields: Vec<InputField>,
    /// Whether `subject`, any of `input_fields` or any of `suggestion_lines` had a hidden or
    /// bidirectional character, now shown as a mark.
    pub hidden_marked: bool,
    /// Whether `subject` is one of `input_fields` (another tool's first string), so it is not
    /// shown a second time.
    pub subject_in_fields: bool,
    /// Whether a Bash call asks to run outside the sandbox (`dangerouslyDisableSandbox` is true).
    pub sandbox_off: bool,
    /// A file tool's path as the request gives it, to open; `subject` is that path with hidden
    /// characters marked.
    pub raw_path: Option<String>,
    /// One line per offered suggestion, so "allow for this session" lists everything it accepts.
    pub suggestion_lines: Vec<SuggestionLine>,
}

/// One suggestion the CLI offered, by its `kind` and the `detail` the screen words it with.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SuggestionLine {
    pub kind: String,
    pub detail: String,
}

/// One key of a tool's input and its value: a string as it is, any other value as compact JSON,
/// hidden characters marked.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct InputField {
    pub key: String,
    pub value: String,
}

/// An `AskUserQuestion`: its questions, each with the options to choose from.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct QuestionCard {
    pub request_id: String,
    pub questions: Vec<QuestionView>,
    pub answered: Option<ApprovalOutcome>,
    pub failure: Option<String>,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct QuestionView {
    pub text: String,
    pub header: Option<String>,
    pub multi_select: bool,
    pub options: Vec<QuestionOption>,
}

/// One option of a question: the `label` the answer sends, and the `description` the request
/// gives it, if any.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct QuestionOption {
    pub label: String,
    pub description: Option<String>,
}

const BY_COMMAND: [&str; 1] = ["Bash"];
const BY_FILE: [&str; 5] = ["Edit", "Write", "Read", "NotebookEdit", "MultiEdit"];
const WITHOUT_FIELDS: [&str; 3] = ["Edit", "Write", "Read"];
const ASK_TOOL: &str = "AskUserQuestion";

/// Where the CLI can keep a rule the user allows for good, in the order a card offers them.
pub const SUGGESTION_DESTINATIONS: [&str; 4] = [
    "localSettings",
    "projectSettings",
    "userSettings",
    "session",
];

/// The suggestions as lines, in the order offered, hidden characters in each detail marked.
pub fn suggestion_lines_of(suggestions: &[SuggestionRecord]) -> Vec<SuggestionLine> {
    suggestions
        .iter()
        .map(|it| SuggestionLine {
            kind: it.kind.clone(),
            detail: visible(&it.detail).text,
        })
        .collect()
}

/// The card for `approval`; `go` is where a plan's first choice leads.
pub fn card_of(approval: &ApprovalRecord, go: PlanGo) -> ThreadCard {
    match approval.tool_name.as_deref() {
        Some(PLAN_TOOL) => ThreadCard::Plan(plan_card_of(approval, go)),
        Some(ASK_TOOL) => ThreadCard::Question(question_card_of(approval)),
        _ if approval.ask => ThreadCard::Question(question_card_of(approval)),
        _ => ThreadCard::Permission(permission_card_of(approval)),
    }
}

fn object_of(approval: &ApprovalRecord) -> Option<&Map<String, Value>> {
    approval.input.as_deref()?.as_object()
}

fn is_true(value: Option<&Value>) -> bool {
    value == Some(&Value::Bool(true))
}

fn question_card_of(approval: &ApprovalRecord) -> QuestionCard {
    let items = object_of(approval)
        .and_then(|input| input.array("questions"))
        .map_or(&[][..], Vec::as_slice);
    let questions = items
        .iter()
        .filter_map(|item| {
            let question = item.as_object()?;
            let text = question.string("question")?;
            let options = question
                .array("options")
                .map_or(&[][..], Vec::as_slice)
                .iter()
                .filter_map(|item| {
                    let option = item.as_object()?;
                    Some(QuestionOption {
                        label: option.string("label")?.to_owned(),
                        description: option.string("description").map(str::to_owned),
                    })
                })
                .collect();
            Some(QuestionView {
                text: text.to_owned(),
                header: question.string("header").map(str::to_owned),
                multi_select: is_true(question.get("multiSelect")),
                options,
            })
        })
        .collect();
    QuestionCard {
        request_id: approval.request_id.clone(),
        questions,
        answered: approval.outcome,
        failure: approval.failure.clone(),
    }
}

fn permission_card_of(approval: &ApprovalRecord) -> PermissionCard {
    let input = object_of(approval);
    let tool = approval.tool_name.as_deref().unwrap_or("?");
    let by_command = BY_COMMAND.contains(&tool);
    let (subject_key, raw) = match input.and_then(|input| subject_of(tool, input)) {
        Some((key, raw)) => (key, Some(raw)),
        None => (None, None),
    };
    let subject = raw.map(visible);
    let left = |key: &str| subject_key == Some(key) || (by_command && key == "description");
    let fields: Vec<(VisibleText, VisibleText)> = match input {
        Some(input) if !WITHOUT_FIELDS.contains(&tool) => input
            .iter()
            .filter(|(key, _)| !left(key))
            .map(|(key, value)| {
                let shown = match value {
                    Value::String(text) => visible(text),
                    other => visible(&compact(other)),
                };
                (visible(key), shown)
            })
            .collect(),
        _ => Vec::new(),
    };
    let hidden_marked = subject.as_ref().is_some_and(|it| it.had_hidden)
        || fields
            .iter()
            .any(|(key, value)| key.had_hidden || value.had_hidden)
        || approval
            .suggestions
            .iter()
            .any(|it| visible(&it.detail).had_hidden);
    PermissionCard {
        request_id: approval.request_id.clone(),
        tool_name: tool.to_owned(),
        subject_in_fields: subject.is_some() && subject_key.is_none(),
        subject: subject.map(|it| it.text),
        suggestions: Arc::clone(&approval.suggestions),
        answered: approval.outcome,
        failure: approval.failure.clone(),
        diff: edit_diff(tool, approval.input.as_deref()),
        input_fields: fields
            .into_iter()
            .map(|(key, value)| InputField {
                key: key.text,
                value: value.text,
            })
            .collect(),
        hidden_marked,
        sandbox_off: by_command
            && input.is_some_and(|it| is_true(it.get("dangerouslyDisableSandbox"))),
        raw_path: raw.filter(|_| BY_FILE.contains(&tool)).map(str::to_owned),
        suggestion_lines: suggestion_lines_of(&approval.suggestions),
    }
}

/// The subject and the key it is under: the command or the path; or another tool's first
/// string, under no key, as it stays among the fields.
fn subject_of<'a>(
    tool: &str,
    input: &'a Map<String, Value>,
) -> Option<(Option<&'static str>, &'a str)> {
    let keyed = |key: &'static str| input.string(key).map(|it| (Some(key), it));
    if BY_COMMAND.contains(&tool) {
        keyed("command")
    } else if BY_FILE.contains(&tool) {
        keyed("file_path").or_else(|| keyed("notebook_path"))
    } else {
        input.values().find_map(Value::as_str).map(|it| (None, it))
    }
}

/// What an allow sends: the request's own input, so the tool runs on what it asked for (never
/// on `{}`).
pub fn allow_payload(approval: &ApprovalRecord) -> String {
    approval
        .input
        .as_deref()
        .map_or_else(|| "{}".to_owned(), compact)
}

/// What answering a question sends: the request's input with `answers` added, by question text,
/// each answer as [`decisions::question_answers`] joins it (captures 14 and 18; a multi-select
/// join is not captured, it follows sdk-tools.d.ts' string value). An `answers` already in the
/// input is replaced where it stands; a question given twice keeps its first place and its last
/// answer.
pub fn answer_payload(approval: &ApprovalRecord, answers: &[(String, String)]) -> String {
    let mut payload = object_of(approval).cloned().unwrap_or_default();
    let mut answered = Map::new();
    for (question, answer) in answers {
        answered.insert(question.clone(), Value::String(answer.clone()));
    }
    payload.insert("answers".to_owned(), Value::Object(answered));
    compact(&Value::Object(payload))
}

/// What goes to the CLI with an allow that keeps `accepted` (the suggestions as the CLI sent
/// them, rewritten only where the user chose another place to keep them) and runs on the
/// request's own input.
pub fn passed_on(approval: &ApprovalRecord, accepted: &[SuggestionRecord]) -> PassedOn {
    PassedOn {
        updated_permissions: (!accepted.is_empty()).then(|| {
            let raws: Vec<&str> = accepted.iter().map(|it| it.raw.as_str()).collect();
            format!("[{}]", raws.join(","))
        }),
        accepted_suggestions: accepted.iter().map(|it| it.id.clone()).collect(),
        input: object_input(approval),
    }
}

/// The request's input when it is an object, as [`PassedOn`] carries it.
pub(crate) fn object_input(approval: &ApprovalRecord) -> Option<Arc<Map<String, Value>>> {
    object_of(approval).map(|it| Arc::new(it.clone()))
}

/// `suggestion` kept in `destination` instead of where the CLI proposed; as it is when its raw
/// item is not a JSON object.
pub fn with_destination(suggestion: &SuggestionRecord, destination: &str) -> SuggestionRecord {
    let Some(Value::Object(mut raw)) = parse(&suggestion.raw) else {
        return suggestion.clone();
    };
    raw.insert(
        "destination".to_owned(),
        Value::String(destination.to_owned()),
    );
    SuggestionRecord {
        destination: Some(destination.to_owned()),
        raw: compact(&Value::Object(raw)),
        ..suggestion.clone()
    }
}
