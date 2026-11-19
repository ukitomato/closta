//! Every word the window shows, in English as the JetBrains plugin's `ClostaBundle.properties`
//! has it, and the lines the conversation's rows are written with (ThreadViews.kt,
//! TurnChangeRules.kt, CardViews.kt, CardParts.kt, PlanCardView.kt).

use closta_presenter::cards::ThreadCard;
use closta_presenter::cards::plan::PlanCard;
use closta_presenter::rows::{CardRow, ExploredRow, TurnEndRow};
use closta_presenter::tool_line::{AgentSummary, ToolLineState};
use closta_presenter::transcript::ApprovalOutcome;

/// The conversation pane with no rows (`thread.empty`).
pub const EMPTY: &str = "No messages yet";
/// The button that scrolls back to the tail (`thread.toLatest`).
pub const JUMP_TO_LATEST: &str = "Scroll to latest";
/// The menu items that copy a whole message, which a selection cannot reach once its first row
/// scrolls out of view: the user's (`thread.ask.copy`) and a reply's (`thread.reply.copy`).
pub const COPY_ASK: &str = "Copy";
pub const COPY_REPLY: &str = "Copy Reply";
/// The right pane's title. Not in the bundle: 6a's empty right pane has no key of its own.
pub const SESSION: &str = "Session";
/// The left pane's name (`toolwindow.tab.sessions`).
pub const SESSIONS: &str = "Sessions";
/// The conversation pane's name (`thread.name`).
pub const CONVERSATION: &str = "Conversation";
/// The band under the conversation while a turn runs (`sessions.window.detail.working`).
pub const WORKING: &str = "Working…";
pub const THOUGHT: &str = "Thought";
pub const THINKING: &str = "Thinking…";
pub const EXPLORED: &str = "Explored";
pub const SIGN_IN_TEXT: &str =
    "Claude Code is not signed in. Sign in in the terminal, then send again.";
pub const SIGN_IN_ACTION: &str = "Sign in in the terminal";
/// A tool's state in words (ThreadStyle.kt's `stateWord`).
pub const TOOL_RUNNING: &str = "Running";
pub const TOOL_DONE: &str = "Done";
pub const TOOL_FAILED: &str = "Failed";
/// A card no one has answered yet (`thread.jump.waiting`).
pub const CARD_WAITING: &str = "Waiting for your answer";

/// Why the input cannot send right now.
pub const NOT_RUNNING: &str = "Session is not running";
pub const SEND_CLOSED: &str = "The session has ended. Restart it to send.";
pub const SEND_ENCODE: &str = "This message could not be encoded.";

const SECOND_MS: i64 = 1_000;
const MINUTE_S: i64 = 60;
const MCP_PREFIX: &str = "mcp__";
const EDITS: [&str; 3] = ["Edit", "MultiEdit", "NotebookEdit"];

pub fn tool_state(state: ToolLineState) -> &'static str {
    match state {
        ToolLineState::Running => TOOL_RUNNING,
        ToolLineState::Ok => TOOL_DONE,
        ToolLineState::Error => TOOL_FAILED,
    }
}

/// What an Explored line says after its title: the files it looked at, then each tool and how
/// many times it ran, in the order the tools first came (`"2 files (Read 1, Grep 1)"`).
pub fn explored_files(row: &ExploredRow) -> String {
    let mut counts: Vec<(&str, usize)> = Vec::new();
    for member in &row.members {
        match counts
            .iter_mut()
            .find(|(name, _)| *name == member.tool_name)
        {
            Some((_, count)) => *count += 1,
            None => counts.push((&member.tool_name, 1)),
        }
    }
    let counts = counts
        .iter()
        .map(|(name, count)| format!("{name} {count}"))
        .collect::<Vec<_>>()
        .join(", ");
    format!("{} files ({counts})", row.files())
}

/// A to-do list's title: how many are done of how many (`thread.todo.title`, two spaces).
pub fn todo_title(done: usize, total: usize) -> String {
    format!("Todo  {done} / {total}")
}

/// A turn's end line: how long it took, then what it changed. With no changes known, it says
/// they are being checked while `checking`, and nothing of them otherwise.
pub fn turn_end(row: &TurnEndRow, checking: bool) -> String {
    let time = row.duration_ms.map(duration);
    let files = match &row.changes {
        None => checking.then(|| "Checking changed files".to_owned()),
        Some(changes) if changes.files.is_empty() => Some("No file changes".to_owned()),
        Some(changes) if changes.more => Some(format!("{} or more files", changes.files.len())),
        Some(changes) => Some(match changes.files.len() {
            1 => "1 file".to_owned(),
            count => format!("{count} files"),
        }),
    };
    [time, files]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" · ")
}

/// A turn's time in whole seconds, and in minutes and seconds from a minute on.
fn duration(ms: i64) -> String {
    let seconds = ms / SECOND_MS;
    if seconds < MINUTE_S {
        format!("{seconds} s")
    } else {
        format!("{} min {} s", seconds / MINUTE_S, seconds % MINUTE_S)
    }
}

/// A sub-agent's one-line card: what it was asked to do (its tool's `label` when it says
/// nothing), how many tools it called, and how long it ran once it is done, to a tenth of a
/// second rounded half up as `%.1f` does.
pub fn agent_line(summary: &AgentSummary, label: &str) -> String {
    let what = summary.description.as_deref().unwrap_or(label);
    let mut line = format!("{what} · Tools: {}", summary.tools);
    if let Some(ms) = summary.duration_ms {
        let tenths = (ms.max(0) + 50) / 100;
        line.push_str(&format!(" · {}.{} s", tenths / 10, tenths % 10));
    }
    line
}

/// A card as 6a draws it: its title and how it was answered, or that it waits.
pub fn card_line(row: &CardRow) -> String {
    let (title, said) = match &row.card {
        ThreadCard::Permission(card) => (
            headline(&card.tool_name, card.subject.as_deref()),
            card.answered.map(|it| outcome(it, false)),
        ),
        ThreadCard::Question(card) => (
            if card.questions.len() > 1 {
                format!("{} questions from Claude", card.questions.len())
            } else {
                "Question from Claude".to_owned()
            },
            card.answered.map(|it| outcome(it, true)),
        ),
        ThreadCard::Plan(card) => ("Approve this plan?".to_owned(), plan_outcome(card)),
    };
    format!("{title} · {}", said.unwrap_or(CARD_WAITING))
}

/// A permission card's headline, with the file's name after it for a file tool.
fn headline(tool: &str, subject: Option<&str>) -> String {
    let file = subject
        .map(|it| it.rsplit('/').next().unwrap_or(it))
        .map(|it| it.rsplit('\\').next().unwrap_or(it));
    let with_file = |text: &str| match file {
        Some(file) => format!("{text} {file}"),
        None => text.to_owned(),
    };
    match tool {
        "Bash" => "Run a command".to_owned(),
        _ if EDITS.contains(&tool) => with_file("Edit file:"),
        "Write" => with_file("Write to file:"),
        "Read" => with_file("Read file:"),
        "WebFetch" | "WebSearch" => "Browse the web".to_owned(),
        _ if tool.starts_with(MCP_PREFIX) => {
            let rest = &tool[MCP_PREFIX.len()..];
            let (server, name) = rest.split_once("__").unwrap_or((rest, ""));
            format!("Use {name} from {server}")
        }
        _ => format!("Use {tool}"),
    }
}

fn outcome(outcome: ApprovalOutcome, question: bool) -> &'static str {
    match outcome {
        ApprovalOutcome::Approved if question => "Answered",
        ApprovalOutcome::Approved => "Allowed",
        ApprovalOutcome::Denied if question => "Not answered",
        ApprovalOutcome::Denied => "Denied",
        ApprovalOutcome::Cancelled => "Cancelled",
        ApprovalOutcome::Expired => "Timed out without an answer",
    }
}

fn plan_outcome(card: &PlanCard) -> Option<&'static str> {
    card.answered.map(|it| match it {
        ApprovalOutcome::Approved => "Plan approved",
        ApprovalOutcome::Denied => "Kept planning",
        other => outcome(other, false),
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Arc;

    use closta_presenter::cards::plan::{PlanCard, PlanGo};
    use closta_presenter::cards::{PermissionCard, QuestionCard, QuestionView, ThreadCard};
    use closta_presenter::records::turn_end::{ChangedFile, TurnChangesRecord};
    use closta_presenter::rows::{CardRow, ExploredRow, ToolRow, TurnEndRow};
    use closta_presenter::tool_line::{AgentSummary, ToolDetail, ToolLine, ToolLineState};
    use closta_presenter::transcript::ApprovalOutcome;

    use super::*;

    fn tool(key: &str, name: &str, target: &str) -> Arc<ToolRow> {
        Arc::new(ToolRow {
            key: key.to_owned(),
            line: ToolLine {
                state: ToolLineState::Ok,
                label: format!("{name}({target})"),
                added: None,
                removed: None,
            },
            tool_use_id: key.to_owned(),
            tool_name: name.to_owned(),
            depth: 0,
            opens: false,
            detail: Some(ToolDetail {
                input: String::new(),
                output: None,
                output_cut: false,
                target: Some(target.to_owned()),
            }),
            agent: None,
        })
    }

    fn explored(members: Vec<Arc<ToolRow>>) -> ExploredRow {
        ExploredRow {
            key: "m/explored".to_owned(),
            members,
            depth: 0,
            opens: false,
        }
    }

    fn file(path: &str) -> ChangedFile {
        ChangedFile {
            path: path.to_owned(),
            added: 1,
            removed: 0,
            created: false,
            deleted: false,
            revertable: true,
            counted: true,
        }
    }

    fn end(duration_ms: Option<i64>, changes: Option<TurnChangesRecord>) -> TurnEndRow {
        TurnEndRow {
            key: "m/end".to_owned(),
            ask_key: "a".to_owned(),
            duration_ms,
            changes,
            followed: false,
            opens: false,
        }
    }

    fn changes(count: usize, more: bool) -> Option<TurnChangesRecord> {
        let files: Vec<ChangedFile> = (0..count).map(|at| file(&format!("/p/f{at}"))).collect();
        Some(TurnChangesRecord {
            files: files.into(),
            more,
        })
    }

    fn card(card: ThreadCard) -> CardRow {
        CardRow {
            key: "m/card".to_owned(),
            card,
            opens: false,
        }
    }

    fn permission(
        tool: &str,
        subject: Option<&str>,
        answered: Option<ApprovalOutcome>,
    ) -> ThreadCard {
        ThreadCard::Permission(PermissionCard {
            request_id: "r".to_owned(),
            tool_name: tool.to_owned(),
            subject: subject.map(str::to_owned),
            suggestions: Arc::from([]),
            answered,
            failure: None,
            diff: None,
            input_fields: Vec::new(),
            hidden_marked: false,
            subject_in_fields: false,
            sandbox_off: false,
            raw_path: None,
            suggestion_lines: Vec::new(),
        })
    }

    fn question(count: usize, answered: Option<ApprovalOutcome>) -> ThreadCard {
        let one = QuestionView {
            text: "Which?".to_owned(),
            header: None,
            multi_select: false,
            options: Vec::new(),
        };
        ThreadCard::Question(QuestionCard {
            request_id: "r".to_owned(),
            questions: vec![one; count],
            answered,
            failure: None,
        })
    }

    fn plan(answered: Option<ApprovalOutcome>) -> ThreadCard {
        ThreadCard::Plan(PlanCard {
            request_id: "r".to_owned(),
            plan: None,
            answered,
            failure: None,
            go: PlanGo::Auto,
        })
    }

    #[test]
    fn explored_counts_files_and_tools_in_order() {
        let row = explored(vec![
            tool("1", "Read", "/p/A.kt"),
            tool("2", "Grep", "retry"),
        ]);
        assert_eq!(explored_files(&row), "2 files (Read 1, Grep 1)");
        // The kinds keep the order they first came in; the same file read twice is one file.
        let row = explored(vec![
            tool("1", "Grep", "retry"),
            tool("2", "Read", "/p/A.kt"),
            tool("3", "Read", "/p/A.kt"),
            tool("4", "Glob", "*.kt"),
        ]);
        assert_eq!(explored_files(&row), "3 files (Grep 1, Read 2, Glob 1)");
    }

    #[test]
    fn todo_title_has_two_spaces_as_the_bundle_does() {
        assert_eq!(todo_title(1, 3), "Todo  1 / 3");
        assert_eq!(todo_title(0, 0), "Todo  0 / 0");
    }

    #[test]
    fn turn_end_says_time_and_files() {
        assert_eq!(
            turn_end(&end(Some(23_400), changes(1, false)), false),
            "23 s · 1 file"
        );
        assert_eq!(
            turn_end(&end(Some(23_400), changes(2, false)), true),
            "23 s · 2 files"
        );
        assert_eq!(turn_end(&end(None, changes(2, false)), false), "2 files");
        assert_eq!(
            turn_end(&end(Some(5_000), changes(20, true)), false),
            "5 s · 20 or more files"
        );
        assert_eq!(
            turn_end(&end(Some(23_400), changes(0, false)), false),
            "23 s · No file changes"
        );
        assert_eq!(
            turn_end(&end(Some(23_400), None), true),
            "23 s · Checking changed files"
        );
        assert_eq!(turn_end(&end(Some(23_400), None), false), "23 s");
        // A minute or more as ThreadViews.kt writes it (TurnChangeRules.kt's duration).
        assert_eq!(turn_end(&end(Some(83_999), None), false), "1 min 23 s");
        assert_eq!(turn_end(&end(Some(999), None), false), "0 s");
        assert_eq!(turn_end(&end(None, None), false), "");
    }

    #[test]
    fn agent_line_names_the_description_and_the_tools() {
        let summary = AgentSummary {
            description: Some("Find the callers".to_owned()),
            tools: 0,
            duration_ms: None,
        };
        assert_eq!(agent_line(&summary, "Task"), "Find the callers · Tools: 0");
        let done = AgentSummary {
            description: None,
            tools: 4,
            duration_ms: Some(3_250),
        };
        // With no description, the tool's line names it (ThreadViews.kt's agentCard); the time is
        // rounded half up, as Kotlin's `%.1f` rounds.
        assert_eq!(agent_line(&done, "Task"), "Task · Tools: 4 · 3.3 s");
        let quick = AgentSummary {
            duration_ms: Some(3_240),
            ..done
        };
        assert_eq!(agent_line(&quick, "Agent"), "Agent · Tools: 4 · 3.2 s");
    }

    #[test]
    fn card_line_names_the_card_and_whether_it_was_answered() {
        let waiting = card(permission("Bash", Some("ls"), None));
        assert_eq!(
            card_line(&waiting),
            "Run a command · Waiting for your answer"
        );
        let edit = card(permission(
            "Edit",
            Some("/p/src/AuthService.kt"),
            Some(ApprovalOutcome::Approved),
        ));
        assert_eq!(card_line(&edit), "Edit file: AuthService.kt · Allowed");
        let mcp = card(permission(
            "mcp__github__search",
            None,
            Some(ApprovalOutcome::Denied),
        ));
        assert_eq!(card_line(&mcp), "Use search from github · Denied");
        let other = card(permission("Task", None, Some(ApprovalOutcome::Expired)));
        assert_eq!(card_line(&other), "Use Task · Timed out without an answer");
        assert_eq!(
            card_line(&card(question(1, Some(ApprovalOutcome::Approved)))),
            "Question from Claude · Answered"
        );
        assert_eq!(
            card_line(&card(question(2, Some(ApprovalOutcome::Denied)))),
            "2 questions from Claude · Not answered"
        );
        assert_eq!(
            card_line(&card(plan(Some(ApprovalOutcome::Approved)))),
            "Approve this plan? · Plan approved"
        );
        assert_eq!(
            card_line(&card(plan(Some(ApprovalOutcome::Cancelled)))),
            "Approve this plan? · Cancelled"
        );
    }

    /// The bundle's English, read from the JetBrains plugin's resources.
    fn bundle() -> HashMap<String, String> {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../jetbrains/src/main/resources/messages/ClostaBundle.properties"
        );
        let text = std::fs::read_to_string(path).expect("the bundle is in the repository");
        text.lines()
            .filter(|line| !line.starts_with('#'))
            .filter_map(|line| line.split_once('='))
            .map(|(key, value)| (key.trim().to_owned(), value.replace("''", "'")))
            .collect()
    }

    #[test]
    fn every_text_is_the_bundles_english() {
        let bundle = bundle();
        for (key, text) in [
            ("thread.empty", EMPTY),
            ("thread.thinking.done", THOUGHT),
            ("thread.thinking.running", THINKING),
            ("thread.explored.title", EXPLORED),
            ("thread.signIn.text", SIGN_IN_TEXT),
            ("thread.signIn.action", SIGN_IN_ACTION),
            ("thread.toLatest", JUMP_TO_LATEST),
            ("thread.ask.copy", COPY_ASK),
            ("thread.reply.copy", COPY_REPLY),
            ("thread.tool.running", TOOL_RUNNING),
            ("thread.tool.done", TOOL_DONE),
            ("mcp.status.failed", TOOL_FAILED),
            ("thread.jump.waiting", CARD_WAITING),
            ("thread.name", CONVERSATION),
            ("toolwindow.tab.sessions", SESSIONS),
            ("sessions.window.detail.working", WORKING),
        ] {
            assert_eq!(bundle.get(key).map(String::as_str), Some(text), "{key}");
        }
        // The words the lines above are written with, as the bundle's patterns have them.
        for (key, pattern) in [
            ("thread.todo.title", "Todo  {0} / {1}"),
            ("thread.explored.files", "{0} files ({1})"),
            ("chat.mcp.tools", "Tools: {0}"),
            ("chat.duration.seconds", "{0} s"),
            ("chat.duration.minutes", "{0} min {1} s"),
            ("chat.turnEnd.checking", "Checking changed files"),
            ("chat.turnEnd.noChanges", "No file changes"),
            (
                "chat.turnEnd.files",
                "{0} {0,choice,0#files|1#file|1<files}",
            ),
            ("chat.turnEnd.filesMore", "{0} or more files"),
            ("thread.headline.bash", "Run a command"),
            ("thread.headline.edit", "Edit file:"),
            ("thread.headline.write", "Write to file:"),
            ("thread.headline.read", "Read file:"),
            ("thread.headline.web", "Browse the web"),
            ("thread.headline.mcp", "Use {1} from {0}"),
            ("thread.headline.tool", "Use {0}"),
            ("thread.question.title", "Question from Claude"),
            ("thread.question.titleMany", "{0} questions from Claude"),
            ("thread.plan.title", "Approve this plan?"),
            ("thread.plan.approved", "Plan approved"),
            ("thread.plan.keptPlanning", "Kept planning"),
            ("thread.card.answered", "Answered"),
            ("thread.card.allowed", "Allowed"),
            ("thread.card.notAnswered", "Not answered"),
            ("thread.card.denied", "Denied"),
            ("thread.card.cancelled", "Cancelled"),
            ("thread.card.expired", "Timed out without an answer"),
        ] {
            assert_eq!(bundle.get(key).map(String::as_str), Some(pattern), "{key}");
        }
    }
}
