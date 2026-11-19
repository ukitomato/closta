//! Every word the window shows, in English as the JetBrains plugin's `ClostaBundle.properties`
//! has it, and the lines the conversation's rows are written with (ThreadViews.kt,
//! TurnChangeRules.kt, CardViews.kt, CardParts.kt, PlanCardView.kt).

use closta_presenter::cards::plan::{PlanCard, PlanGo};
use closta_presenter::cards::{SuggestionLine, ThreadCard};
use closta_presenter::rows::{CardRow, CompactionRow, ExploredRow, TurnEndRow};
use closta_presenter::tool_line::{AgentSummary, ToolLineState};
use closta_presenter::transcript::{ApprovalOutcome, CompactionOutcome};
use closta_providers::claude::process::ProcessFailure;
use closta_session::status::SessionFailure;

use crate::new_session::Runtime;

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

pub const COMPOSER_PLACEHOLDER: &str = "Ask Claude (Shift+Enter for a new line)";
pub const SEND: &str = "Send";
pub const STOP: &str = "Stop";
/// What a message that was not sent is marked with.
pub const NOT_SENT: &str = "Not sent";
pub const COMPACTING: &str = "Compacting conversation…";
pub const COMPACTION_FAILED: &str = "Compaction failed";

/// The New Session dialog.
pub const NEW_SESSION: &str = "New Session";
pub const NEW_SESSION_BUTTON: &str = "+ New Session";
pub const FOLDER: &str = "Folder";
pub const RUNTIME: &str = "Runtime";
pub const CANCEL: &str = "Cancel";
pub const START: &str = "Start";
pub const CHECKING: &str = "Checking…";
pub const FOLDER_MISSING: &str = "This folder does not exist.";
pub const CLAUDE_EXE_MISSING: &str = "claude.exe was not found on PATH.";
pub const CLAUDE_SCRIPT_ONLY: &str =
    "Only a script was found for claude; install the native claude.exe.";

/// A failed session's band.
pub const RESTART: &str = "Restart";
pub const RESTART_NOTE: &str = "Restart starts a new conversation.";
pub const SESSION_ENDED: &str = "Session ended";

/// While the window closes its sessions.
pub const CLOSING: &str = "Closing sessions…";
pub const CLOSE: &str = "Close";

/// The trigger the CLI reports for a compaction it chose to do.
const AUTO_TRIGGER: &str = "auto";
const THOUSAND: i64 = 1_000;
const MILLION: i64 = 1_000_000;
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

/// The band under the conversation: working, or compacting while the CLI compacts.
pub fn band(compacting: bool) -> &'static str {
    if compacting { COMPACTING } else { WORKING }
}

/// A token count as `812`, `20.1k` or `1.2M`, to a tenth rounded half up.
pub fn tokens(n: i64) -> String {
    let tenths = |unit: i64| {
        let tenths = (n * 10 + unit / 2) / unit;
        format!("{}.{}", tenths / 10, tenths % 10)
    };
    if n < THOUSAND {
        n.to_string()
    } else if n < MILLION - THOUSAND / 20 {
        // From 999,950 the tenths of a thousand round up to 1000.0k: that is 1.0M.
        format!("{}k", tenths(THOUSAND))
    } else {
        format!("{}M", tenths(MILLION))
    }
}

/// The line a compaction's divider says: the tokens before and after, and `auto` when the CLI
/// chose to compact.
pub fn compaction_line(row: &CompactionRow) -> String {
    match &row.outcome {
        CompactionOutcome::Failed => COMPACTION_FAILED.to_owned(),
        CompactionOutcome::Compacted {
            trigger,
            pre_tokens,
            post_tokens,
        } => {
            let mut line = format!(
                "Conversation compacted · {} → {} tokens",
                tokens(*pre_tokens),
                tokens(*post_tokens)
            );
            if trigger == AUTO_TRIGGER {
                line.push_str(" · auto");
            }
            line
        }
    }
}

pub fn distro_missing(distro: &str) -> String {
    format!("{distro} is not installed.")
}

pub fn runtime_label(runtime: &Runtime) -> String {
    match runtime {
        Runtime::Win32 => "Windows".to_owned(),
        Runtime::Wsl { distro } => format!("WSL · {distro}"),
    }
}

/// What closing the window asks while sessions work or drafts are unsent: the parts that are not
/// zero, with `1` in the singular.
pub fn close_question(working: usize, drafts: usize) -> String {
    debug_assert!(working + drafts > 0, "nothing to close over");
    let working = match working {
        0 => None,
        1 => Some("1 session is working".to_owned()),
        count => Some(format!("{count} sessions are working")),
    };
    let drafts = match drafts {
        0 => None,
        1 => Some("1 unsent draft".to_owned()),
        count => Some(format!("{count} unsent drafts")),
    };
    let parts: Vec<String> = [working, drafts].into_iter().flatten().collect();
    format!("{}. Close anyway?", parts.join(" / "))
}

/// A failure's title and its hint. Neither holds a path, a value of the environment or a text of
/// the user: the kinds and the distro are all it names.
pub fn failure_text(failure: &SessionFailure, distro: Option<&str>) -> (String, Option<String>) {
    let wsl_hint = || "Run `claude --version` in a WSL terminal.".to_owned();
    let (title, hint) = match failure {
        SessionFailure::LaunchFailed { kind } => {
            (format!("claude could not be started ({kind:?})."), None)
        }
        SessionFailure::WorkingDirectoryMissing { .. } => (
            FOLDER_MISSING.to_owned(),
            Some("It may have been moved or deleted.".to_owned()),
        ),
        SessionFailure::WslUnavailable { distro } => (
            format!("{distro} is not available."),
            Some("Check that the distribution is installed and holds this folder.".to_owned()),
        ),
        SessionFailure::WslCommandNotFound { distro } => (
            format!("claude is not installed in {distro}, or not on the login shell's PATH."),
            Some(wsl_hint()),
        ),
        SessionFailure::CommandNotFound => (
            CLAUDE_EXE_MISSING.to_owned(),
            Some("Install the native claude.exe, then restart.".to_owned()),
        ),
        SessionFailure::ScriptOnly => (CLAUDE_SCRIPT_ONLY.to_owned(), None),
        SessionFailure::TooManyProcesses => (
            "Too many sessions are running. Close one and restart.".to_owned(),
            None,
        ),
        SessionFailure::EndedAbnormally(ProcessFailure::Exit(code)) => {
            (format!("claude exited with code {code}."), None)
        }
        SessionFailure::EndedAbnormally(ProcessFailure::Io(kind)) => (
            format!("claude's output could not be read ({kind:?})."),
            None,
        ),
        SessionFailure::VersionCheckFailed(_) => (
            "claude did not report its version.".to_owned(),
            Some(match distro {
                Some(_) => wsl_hint(),
                None => "Run `claude --version` in a terminal.".to_owned(),
            }),
        ),
        SessionFailure::PlanFailed => ("The session could not be prepared.".to_owned(), None),
    };
    (title, hint)
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

/// The card buttons and their notes (`thread.permission.*`).
pub const ALLOW: &str = "Allow (1)";
pub const ALLOW_ALWAYS: &str = "Always Allow (2)";
pub const ALLOW_SESSION: &str = "Allow for This Session (2)";
pub const DENY_NOTE: &str = "Deny…";
pub const DENY_SEND: &str = "Deny";
pub const DENY_NOTE_PLACEHOLDER: &str =
    "Say what you want instead and press Enter (sent as a denial)";
pub const DESTINATION_WORDS: &str = "Always Allow saves the rule to:";
pub const HIDDEN_MARKED: &str = "This input has hidden or direction-changing characters, shown as marks such as <U+202E>. Read it before you allow it.";
pub const SANDBOX_OFF: &str =
    "This command asks to run outside the sandbox (dangerouslyDisableSandbox is true).";
/// The edit card (`thread.diff.replaceAll`) and the mark after a cut diff.
pub const REPLACE_ALL: &str = "Replace all";
pub const DIFF_MORE: &str = "…";
/// The plan card (`thread.plan.*`).
pub const PLAN_TITLE: &str = "Approve this plan?";
pub const PLAN_ASK_EDITS: &str = "Approve and Review Edits (2)";
pub const PLAN_KEEP: &str = "Keep Planning (3)";
pub const PLAN_NOTE: &str = "Keep Planning…";
pub const PLAN_NOTE_PLACEHOLDER: &str = "Say what to change and press Enter (keeps planning)";
pub const PLAN_MISSING: &str = "The plan's text has not arrived";
/// The question card (`thread.question.*`).
pub const QUESTION_ANSWER: &str = "Answer";
pub const QUESTION_SKIP: &str = "Skip";
pub const QUESTION_OTHER: &str = "Other";
pub const OTHER_PLACEHOLDER: &str = "Write your own answer";
pub const QUESTION_KEYS: &str = "Ctrl+Enter to answer · Esc to skip";
/// `session.answerFailed`.
pub const ANSWER_FAILED: &str = "The answer could not be sent to the session. Answer again.";
/// Not in the bundle: the list's hint for the jump key and the slot limit's note.
pub const JUMP_HINT: &str = "Alt+Shift+W to answer";
pub const SLOT_LIMIT: &str = "Close a session to start another (8 at most).";
/// The Bypass band (`composer.bypass.*`).
pub const BYPASS_CONFIRM: &str =
    "Switch to Bypass Permissions? Tools in this session will run without asking first.";
pub const BYPASS_SWITCH: &str = "Switch";

/// The Deny button, numbered after the choices before it (`thread.permission.deny`).
pub fn deny_button(buttons: usize) -> String {
    format!("Deny ({buttons})")
}

/// The name of where a rule is kept (`thread.destination.*`).
pub fn destination_name(destination: Option<&str>) -> &'static str {
    match destination {
        Some("localSettings") => "This project (only me)",
        Some("projectSettings") => "This project (shared)",
        Some("userSettings") => "All projects",
        Some("session") => "This session only",
        _ => "Destination",
    }
}

/// The second button's label, as `keepLabel` of the JetBrains plugin picks it.
pub fn keep_label(offers_destination: bool, destination: Option<&str>) -> &'static str {
    if !offers_destination || destination == Some("session") {
        ALLOW_SESSION
    } else {
        ALLOW_ALWAYS
    }
}

pub fn permission_keys(buttons: usize) -> String {
    format!("1\u{2013}{buttons} to choose \u{b7} Esc to deny")
}

pub fn plan_keys(buttons: usize) -> String {
    format!("1\u{2013}{buttons} to choose \u{b7} Esc to keep planning")
}

/// One suggested rule change, worded as `thread.permission.suggestion.*`.
pub fn suggestion_text(line: &SuggestionLine) -> String {
    let detail = &line.detail;
    match line.kind.as_str() {
        "addRules" => format!("Always allow: {detail}"),
        "replaceRules" => format!("Replace the rules with: {detail}"),
        "removeRules" => format!("Remove the rules: {detail}"),
        "setMode" => format!("Switch to {detail} mode"),
        "addDirectories" => format!("Allow access to: {detail}"),
        "removeDirectories" => format!("Remove access to: {detail}"),
        kind => format!("Also: {kind} {detail}"),
    }
}

/// The `+a \u{2212}r` counts of an edit; the minus is U+2212.
pub fn diff_counts(added: i32, removed: i32) -> String {
    format!("+{added} \u{2212}{removed}")
}

/// The first plan button, by the mode the plan goes into (`thread.plan.go.*`).
pub fn plan_go(go: PlanGo) -> &'static str {
    match go {
        PlanGo::Auto => "Approve and Use Auto Mode (1)",
        PlanGo::AcceptEdits => "Approve and Auto-Accept Edits (1)",
        PlanGo::Bypass => "Approve and Switch to Bypass (1)",
    }
}

/// A question card's title (`thread.question.title`, `thread.question.titleMany`).
pub fn question_title(questions: usize) -> String {
    if questions > 1 {
        format!("{questions} questions from Claude")
    } else {
        "Question from Claude".to_owned()
    }
}

/// The window's title, with how many requests wait.
pub fn window_title(base: &str, waiting: usize) -> String {
    if waiting == 0 {
        base.to_owned()
    } else {
        format!("({waiting}) {base}")
    }
}

/// The mode button's short word (`composer.mode.*.short`); an unknown mode as it is.
pub fn mode_label(mode: &str) -> String {
    match mode {
        "default" => "Default",
        "acceptEdits" => "Edits",
        "plan" => "Plan",
        "auto" => "Auto",
        "dontAsk" => "Don't Ask",
        "bypassPermissions" => "Bypass",
        other => other,
    }
    .to_owned()
}

/// The mode's word in the list (`composer.mode.*`); an unknown mode as it is.
pub fn mode_name(mode: &str) -> String {
    match mode {
        "acceptEdits" => "Accept Edits",
        "bypassPermissions" => "Bypass Permissions",
        other => return mode_label(other),
    }
    .to_owned()
}

/// The line under a mode in the list (`composer.mode.hint.*`).
pub fn mode_hint(mode: &str) -> Option<&'static str> {
    Some(match mode {
        "default" => "Ask every time",
        "acceptEdits" => "Do not ask for file edits",
        "plan" => "Plan only, change nothing",
        "auto" => "Let the safety check decide",
        "dontAsk" => "Refuse anything not allowed",
        "bypassPermissions" => "Ask nothing",
        _ => return None,
    })
}

/// `composer.mode.accessible`.
pub fn mode_accessible(mode: &str) -> String {
    format!("Permission mode: {}", mode_name(mode))
}

/// A card as 6a draws it: its title and how it was answered, or that it waits.
pub fn card_line(row: &CardRow) -> String {
    let (title, said) = match &row.card {
        ThreadCard::Permission(card) => (
            headline(&card.tool_name, card.subject.as_deref()),
            card.answered.map(|it| outcome(it, false)),
        ),
        ThreadCard::Question(card) => (
            question_title(card.questions.len()),
            card.answered.map(|it| outcome(it, true)),
        ),
        ThreadCard::Plan(card) => (PLAN_TITLE.to_owned(), plan_outcome(card)),
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
    fn the_6c_words_are_jetbrains_words() {
        for (text, spec) in [
            (ALLOW, "Allow (1)"),
            (ALLOW_ALWAYS, "Always Allow (2)"),
            (ALLOW_SESSION, "Allow for This Session (2)"),
            (DENY_NOTE, "Deny\u{2026}"),
            (DENY_SEND, "Deny"),
            (
                DENY_NOTE_PLACEHOLDER,
                "Say what you want instead and press Enter (sent as a denial)",
            ),
            (DESTINATION_WORDS, "Always Allow saves the rule to:"),
            (
                HIDDEN_MARKED,
                "This input has hidden or direction-changing characters, shown as marks such as <U+202E>. Read it before you allow it.",
            ),
            (
                SANDBOX_OFF,
                "This command asks to run outside the sandbox (dangerouslyDisableSandbox is true).",
            ),
            (REPLACE_ALL, "Replace all"),
            (DIFF_MORE, "\u{2026}"),
            (PLAN_TITLE, "Approve this plan?"),
            (PLAN_ASK_EDITS, "Approve and Review Edits (2)"),
            (PLAN_KEEP, "Keep Planning (3)"),
            (PLAN_NOTE, "Keep Planning\u{2026}"),
            (
                PLAN_NOTE_PLACEHOLDER,
                "Say what to change and press Enter (keeps planning)",
            ),
            (PLAN_MISSING, "The plan's text has not arrived"),
            (QUESTION_ANSWER, "Answer"),
            (QUESTION_SKIP, "Skip"),
            (QUESTION_OTHER, "Other"),
            (OTHER_PLACEHOLDER, "Write your own answer"),
            (QUESTION_KEYS, "Ctrl+Enter to answer \u{b7} Esc to skip"),
            (
                ANSWER_FAILED,
                "The answer could not be sent to the session. Answer again.",
            ),
            (JUMP_HINT, "Alt+Shift+W to answer"),
            (SLOT_LIMIT, "Close a session to start another (8 at most)."),
            (
                BYPASS_CONFIRM,
                "Switch to Bypass Permissions? Tools in this session will run without asking first.",
            ),
            (BYPASS_SWITCH, "Switch"),
        ] {
            assert_eq!(text, spec);
        }
        let bundle = bundle();
        for (key, text) in [
            ("thread.permission.allow", ALLOW),
            ("thread.permission.allowAlways", ALLOW_ALWAYS),
            ("thread.permission.allowSession", ALLOW_SESSION),
            (
                "thread.permission.comment.placeholder",
                DENY_NOTE_PLACEHOLDER,
            ),
            ("thread.permission.destination", DESTINATION_WORDS),
            ("thread.permission.hidden", HIDDEN_MARKED),
            ("thread.permission.sandboxOff", SANDBOX_OFF),
            ("thread.diff.replaceAll", REPLACE_ALL),
            ("thread.plan.title", PLAN_TITLE),
            ("thread.plan.askEdits", PLAN_ASK_EDITS),
            ("thread.plan.keepPlanning", PLAN_KEEP),
            ("thread.plan.comment.placeholder", PLAN_NOTE_PLACEHOLDER),
            ("thread.plan.missing", PLAN_MISSING),
            ("thread.question.answer", QUESTION_ANSWER),
            ("thread.question.skip", QUESTION_SKIP),
            ("thread.question.other", QUESTION_OTHER),
            ("thread.question.other.placeholder", OTHER_PLACEHOLDER),
            ("session.answerFailed", ANSWER_FAILED),
            ("composer.bypass.confirm", BYPASS_CONFIRM),
            ("composer.bypass.switch", BYPASS_SWITCH),
        ] {
            assert_eq!(bundle.get(key).map(String::as_str), Some(text), "{key}");
        }
    }

    #[test]
    fn the_keep_button_says_session_unless_a_rule_is_kept_elsewhere() {
        assert_eq!(keep_label(false, None), ALLOW_SESSION);
        assert_eq!(keep_label(true, Some("session")), ALLOW_SESSION);
        assert_eq!(keep_label(true, Some("localSettings")), ALLOW_ALWAYS);
        assert_eq!(keep_label(true, None), ALLOW_ALWAYS);
    }

    #[test]
    fn deny_and_the_key_lines_count_the_buttons() {
        assert_eq!(deny_button(3), "Deny (3)");
        assert_eq!(
            permission_keys(3),
            "1\u{2013}3 to choose \u{b7} Esc to deny"
        );
        assert_eq!(
            plan_keys(3),
            "1\u{2013}3 to choose \u{b7} Esc to keep planning"
        );
    }

    #[test]
    fn destinations_have_names() {
        for (destination, name) in [
            (Some("localSettings"), "This project (only me)"),
            (Some("projectSettings"), "This project (shared)"),
            (Some("userSettings"), "All projects"),
            (Some("session"), "This session only"),
            (Some("other"), "Destination"),
            (None, "Destination"),
        ] {
            assert_eq!(destination_name(destination), name);
        }
    }

    #[test]
    fn suggestions_read_as_jetbrains_says() {
        let line = |kind: &str| SuggestionLine {
            kind: kind.to_owned(),
            detail: "D".to_owned(),
        };
        for (kind, text) in [
            ("addRules", "Always allow: D"),
            ("replaceRules", "Replace the rules with: D"),
            ("removeRules", "Remove the rules: D"),
            ("setMode", "Switch to D mode"),
            ("addDirectories", "Allow access to: D"),
            ("removeDirectories", "Remove access to: D"),
            ("somethingNew", "Also: somethingNew D"),
        ] {
            assert_eq!(suggestion_text(&line(kind)), text);
        }
    }

    #[test]
    fn diff_counts_use_a_true_minus() {
        assert_eq!(diff_counts(2, 1), "+2 \u{2212}1");
    }

    #[test]
    fn the_title_counts_what_waits() {
        assert_eq!(window_title("Closta", 0), "Closta");
        assert_eq!(window_title("Closta", 3), "(3) Closta");
        assert_eq!(question_title(1), "Question from Claude");
        assert_eq!(question_title(2), "2 questions from Claude");
    }

    #[test]
    fn modes_have_short_and_long_words() {
        let bundle = bundle();
        for mode in [
            "default",
            "acceptEdits",
            "plan",
            "auto",
            "dontAsk",
            "bypassPermissions",
        ] {
            assert_eq!(
                bundle.get(&format!("composer.mode.{mode}.short")),
                Some(&mode_label(mode)),
                "{mode}"
            );
            assert_eq!(
                bundle.get(&format!("composer.mode.{mode}")),
                Some(&mode_name(mode)),
                "{mode}"
            );
            assert_eq!(
                bundle
                    .get(&format!("composer.mode.hint.{mode}"))
                    .map(String::as_str),
                mode_hint(mode),
                "{mode}"
            );
            assert_eq!(
                mode_accessible(mode),
                format!("Permission mode: {}", mode_name(mode))
            );
        }
        assert_eq!(mode_label("bypassPermissions"), "Bypass");
        assert_eq!(mode_label("x"), "x");
        assert_eq!(mode_name("x"), "x");
        assert_eq!(mode_hint("x"), None);
    }

    #[test]
    fn plan_buttons_follow_where_the_plan_goes() {
        assert_eq!(plan_go(PlanGo::Auto), "Approve and Use Auto Mode (1)");
        assert_eq!(
            plan_go(PlanGo::AcceptEdits),
            "Approve and Auto-Accept Edits (1)"
        );
        assert_eq!(plan_go(PlanGo::Bypass), "Approve and Switch to Bypass (1)");
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

    fn compaction(outcome: CompactionOutcome) -> CompactionRow {
        CompactionRow {
            key: "compaction/1".to_owned(),
            outcome,
            opens: false,
        }
    }

    fn compacted(trigger: &str, pre: i64, post: i64) -> CompactionRow {
        compaction(CompactionOutcome::Compacted {
            trigger: trigger.to_owned(),
            pre_tokens: pre,
            post_tokens: post,
        })
    }

    #[test]
    fn compaction_lines_say_tokens_and_auto() {
        assert_eq!(
            compaction_line(&compacted("manual", 20_072, 1_235)),
            "Conversation compacted · 20.1k → 1.2k tokens"
        );
        assert_eq!(
            compaction_line(&compacted("auto", 20_072, 1_235)),
            "Conversation compacted · 20.1k → 1.2k tokens · auto"
        );
        assert_eq!(
            compaction_line(&compaction(CompactionOutcome::Failed)),
            "Compaction failed"
        );
    }

    #[test]
    fn tokens_read_as_k_and_m() {
        assert_eq!(tokens(0), "0");
        assert_eq!(tokens(812), "812");
        assert_eq!(tokens(999), "999");
        assert_eq!(tokens(1_000), "1.0k");
        assert_eq!(tokens(20_072), "20.1k");
        assert_eq!(tokens(999_949), "999.9k");
        assert_eq!(tokens(999_950), "1.0M");
        assert_eq!(tokens(999_999), "1.0M");
        assert_eq!(tokens(1_000_000), "1.0M");
        assert_eq!(tokens(1_234_567), "1.2M");
    }

    #[test]
    #[cfg(debug_assertions)]
    #[should_panic(expected = "nothing to close over")]
    fn the_close_question_is_not_asked_over_nothing() {
        close_question(0, 0);
    }

    #[test]
    fn the_close_question_drops_zero_parts_and_says_one_in_the_singular() {
        assert_eq!(
            close_question(2, 1),
            "2 sessions are working / 1 unsent draft. Close anyway?"
        );
        assert_eq!(close_question(1, 0), "1 session is working. Close anyway?");
        assert_eq!(close_question(0, 3), "3 unsent drafts. Close anyway?");
        assert_eq!(
            close_question(1, 2),
            "1 session is working / 2 unsent drafts. Close anyway?"
        );
    }

    #[test]
    fn the_band_says_compacting_while_the_cli_compacts() {
        assert_eq!(band(false), WORKING);
        assert_eq!(band(true), COMPACTING);
    }

    #[test]
    fn the_runtime_and_the_missing_distro_are_worded() {
        assert_eq!(
            runtime_label(&Runtime::Wsl {
                distro: "Ubuntu-26.04".to_owned()
            }),
            "WSL · Ubuntu-26.04"
        );
        assert_eq!(runtime_label(&Runtime::Win32), "Windows");
        assert_eq!(distro_missing("Debian"), "Debian is not installed.");
    }

    fn failures() -> Vec<SessionFailure> {
        use closta_providers::claude::launch::version::VersionFailure;
        use std::io::ErrorKind;
        vec![
            SessionFailure::LaunchFailed {
                kind: ErrorKind::PermissionDenied,
            },
            SessionFailure::WorkingDirectoryMissing {
                path: "/home/someone/x".to_owned(),
            },
            SessionFailure::WslUnavailable {
                distro: "Ubuntu-26.04".to_owned(),
            },
            SessionFailure::WslCommandNotFound {
                distro: "Ubuntu-26.04".to_owned(),
            },
            SessionFailure::CommandNotFound,
            SessionFailure::ScriptOnly,
            SessionFailure::TooManyProcesses,
            SessionFailure::EndedAbnormally(ProcessFailure::Exit(3)),
            SessionFailure::EndedAbnormally(ProcessFailure::Io(ErrorKind::BrokenPipe)),
            SessionFailure::VersionCheckFailed(VersionFailure::NoOutput),
            SessionFailure::PlanFailed,
        ]
    }

    #[test]
    fn every_failure_has_a_title_and_names_no_path() {
        for failure in failures() {
            for distro in [None, Some("Ubuntu-26.04")] {
                let (title, hint) = failure_text(&failure, distro);
                assert!(!title.is_empty(), "{}", failure.kind());
                for text in std::iter::once(&title).chain(hint.as_ref()) {
                    assert!(!text.contains("someone"), "{}", failure.kind());
                    assert!(!text.contains("/home"), "{}", failure.kind());
                    for word in ["IDE", "Settings"] {
                        assert!(!text.contains(word), "{}: {text}", failure.kind());
                    }
                }
            }
        }
    }

    #[test]
    fn the_spec_wording_is_kept() {
        use closta_providers::claude::launch::version::VersionFailure;
        let wsl = SessionFailure::WslCommandNotFound {
            distro: "Ubuntu-26.04".to_owned(),
        };
        assert_eq!(
            failure_text(&wsl, None),
            (
                "claude is not installed in Ubuntu-26.04, or not on the login shell's PATH."
                    .to_owned(),
                Some("Run `claude --version` in a WSL terminal.".to_owned())
            )
        );
        assert_eq!(
            failure_text(&SessionFailure::CommandNotFound, None),
            (
                "claude.exe was not found on PATH.".to_owned(),
                Some("Install the native claude.exe, then restart.".to_owned())
            )
        );
        assert_eq!(
            failure_text(&SessionFailure::TooManyProcesses, None),
            (
                "Too many sessions are running. Close one and restart.".to_owned(),
                None
            )
        );
        assert_eq!(
            failure_text(
                &SessionFailure::EndedAbnormally(ProcessFailure::Exit(3)),
                None
            ),
            ("claude exited with code 3.".to_owned(), None)
        );
        let version = SessionFailure::VersionCheckFailed(VersionFailure::NoAnswer);
        assert_eq!(
            failure_text(&version, Some("Ubuntu-26.04")),
            (
                "claude did not report its version.".to_owned(),
                Some("Run `claude --version` in a WSL terminal.".to_owned())
            )
        );
        assert_eq!(
            failure_text(&version, None).1.as_deref(),
            Some("Run `claude --version` in a terminal.")
        );
        assert_eq!(
            failure_text(&SessionFailure::ScriptOnly, None),
            (CLAUDE_SCRIPT_ONLY.to_owned(), None)
        );
        assert_eq!(
            failure_text(
                &SessionFailure::WorkingDirectoryMissing {
                    path: "/p".to_owned()
                },
                None
            ),
            (
                "This folder does not exist.".to_owned(),
                Some("It may have been moved or deleted.".to_owned())
            )
        );
    }

    #[test]
    fn the_6b_words_are_the_specs() {
        for (text, spec) in [
            (
                COMPOSER_PLACEHOLDER,
                "Ask Claude (Shift+Enter for a new line)",
            ),
            (SEND, "Send"),
            (STOP, "Stop"),
            (NOT_RUNNING, "Session is not running"),
            (SEND_CLOSED, "The session has ended. Restart it to send."),
            (SEND_ENCODE, "This message could not be encoded."),
            (NOT_SENT, "Not sent"),
            (COMPACTING, "Compacting conversation…"),
            (COMPACTION_FAILED, "Compaction failed"),
            (NEW_SESSION, "New Session"),
            (NEW_SESSION_BUTTON, "+ New Session"),
            (FOLDER, "Folder"),
            (RUNTIME, "Runtime"),
            (CANCEL, "Cancel"),
            (START, "Start"),
            (CHECKING, "Checking…"),
            (FOLDER_MISSING, "This folder does not exist."),
            (CLAUDE_EXE_MISSING, "claude.exe was not found on PATH."),
            (
                CLAUDE_SCRIPT_ONLY,
                "Only a script was found for claude; install the native claude.exe.",
            ),
            (RESTART, "Restart"),
            (RESTART_NOTE, "Restart starts a new conversation."),
            (SESSION_ENDED, "Session ended"),
            (CLOSING, "Closing sessions…"),
            (CLOSE, "Close"),
        ] {
            assert_eq!(text, spec);
        }
    }
}
