//! Replays a capture the way the host lived it (CaptureReplay.kt). Stdout alone is not the
//! conversation: the recorder also wrote the user's messages and its answers to `can_use_tool` on
//! stdin (`recorder/scenarios.mjs`), so those come back here as host inputs, where the recorder sent
//! them — a [`UserSent`] right before the `command_lifecycle{queued}` that answers it, a
//! [`Decided`] right after each `control_request`.

use std::collections::{HashMap, HashSet};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use closta_model::{AgentEvent, ApprovalDecision, AttachmentKind};
use closta_presenter::input::{
    ControlRequested, Decided, PassedOn, PresenterInput, SendId, UserSent,
};
use closta_presenter::json::JsonFields;
use closta_presenter::records::attachment::AttachmentRecord;
use closta_presenter::records::operations::ControlKind;
use closta_presenter::session::SessionView;
use serde_json::{Map, Value};

use crate::common;
use crate::projector::project_tree;

/// The one thread a capture is replayed into.
pub const THREAD: &str = "thread-1";

const SANDBOX_PROBE: &str = concat!(
    "Run this exact bash command once and report its output: touch {OUTSIDE}/sandbox-probe.txt. ",
    "If it fails, do not retry it in any other way; just report the error message."
);

const PLAN_README: &str = concat!(
    "Make a short plan to fix the spelling of the headings in README.md, then call ExitPlanMode with it. ",
    "Once it is approved, make the fix with the Edit tool and report done."
);

const ASK: &str = concat!(
    "Use the AskUserQuestion tool to ask the question \"AとBどちらがいいですか？\" ",
    "(header \"選択肢\") with two options: A (\"Aを選択します\") and B (\"Bを選択します\"), multiSelect false."
);

const PONG: &str = "Respond with exactly one word: pong";

/// What each scenario sent, verbatim from `recorder/scenarios.mjs` (the driver filled `{OUTSIDE}`
/// in); `None` for a scenario the table does not know.
fn sent(scenario: &str) -> Option<Vec<&'static str>> {
    Some(match scenario {
        "01-baseline-text" | "03-initialize-handshake" => vec![PONG],
        "02-tool-bash-autorun" => {
            vec!["Run this exact bash command and report its output: echo hello-from-capture"]
        }
        "04-tool-autorun-with-ppt-stdio" => {
            vec!["Run this exact bash command and report its output: echo should-be-denied"]
        }
        "05-permission-can-use-tool" => vec![
            "Use the Write tool to create the file {OUTSIDE}/note.txt containing exactly the text: hello",
        ],
        "06-context-usage" | "07-set-model-and-mode" => vec![],
        "08-subagent-task" => vec![concat!(
            "Use the Agent tool to spawn one subagent (subagent_type \"Explore\", run_in_background false) ",
            "that reads the file NOTES.md in the current directory and reports a one-sentence summary. ",
            "Then relay the summary."
        )],
        "09-parallel-subagents" => vec![concat!(
            "Use the Agent tool to spawn two subagents in parallel in a single message ",
            "(both subagent_type \"Explore\", run_in_background false): ",
            "one reads NOTES.md and the other reads GUIDE.md in the current directory, ",
            "each reporting a one-sentence summary. Then relay both."
        )],
        "10-background-task" => vec![concat!(
            "Use the Agent tool with run_in_background true to run the bash command ",
            "`sleep 45 && echo bg-done` and report its output once it completes."
        )],
        "11-background-followup" => vec![
            concat!(
                "Use the Agent tool with run_in_background true to run the bash command ",
                "`sleep 40 && echo bg2-done` and report its output once it completes."
            ),
            "While that runs: respond with exactly one character: 4 (what is 2+2)",
        ],
        "12-subagent-permission" => vec![concat!(
            "Use the Agent tool to spawn a subagent ",
            "(subagent_type \"general-purpose\", run_in_background false) ",
            "that uses the Write tool to create the file {OUTSIDE}/probe.txt ",
            "containing exactly the text hello. ",
            "Then report done."
        )],
        "13-ask-timeout" | "14-ask-answers-updatedinput" | "15-ask-afktimeout-updatedinput" => {
            vec![ASK]
        }
        // Recorded with 2.1.282 too, the user's settings left out (recorder/scenarios.mjs ISOLATED).
        "16-permission-suggestion-accept" => vec![concat!(
            "Use the Write tool to create the file {OUTSIDE}/note.txt containing exactly the text: hello. ",
            "Then use the Read tool to read {OUTSIDE}/note.txt and report its exact content."
        )],
        "17-edit-approval" => vec![concat!(
            "Use the Edit tool to replace the text old-value with new-value in the file EDITME.md. ",
            "Then report done."
        )],
        "18-ask-multi-question" => vec![concat!(
            "Use the AskUserQuestion tool once, with two questions in the same call: ",
            "first \"AとBどちらがいいですか？\" (header \"選択肢\") with options A (\"Aを選択します\") and ",
            "B (\"Bを選択します\"), multiSelect false; ",
            "second \"XとYどちらにしますか？\" (header \"もう一つ\") with options X (\"Xを選択します\") and ",
            "Y (\"Yを選択します\"), multiSelect false. ",
            "Then report the answers."
        )],
        "19-interrupt-background" => vec![concat!(
            "Use the Agent tool with run_in_background true to run the bash command ",
            "`sleep 60 && echo bg-interrupt-done` and report its output once it completes."
        )],
        "20-todowrite" => vec![concat!(
            "Use the TodoWrite tool to record a todo list with exactly two items: ",
            "\"write tests\" (status pending) and \"run build\" (status in_progress). Then report done."
        )],
        "21-compact" => vec![PONG, "/compact"],
        // Two CLIs of one session. The first took the Bash turn, the second (`--resume`) took the
        // second prompt.
        "22-resume" => vec![
            "Run this exact bash command and report its output: echo hello-from-resume",
            PONG,
        ],
        // One CLI took two turns, each a file ahead of a sentence (what the files were is in the
        // stdin lines).
        "23-attachments" => vec![
            "What is the single color of this image? Answer with exactly one word.",
            "What is the single word written in this PDF? Answer with exactly that word.",
        ],
        // One CLI took MCP control requests only, no user turn (the stdin lines are in 24's stdin
        // file). 28 took control requests only (get_settings and apply_flag_settings).
        "24-mcp-management" | "28-effort-live" => vec![],
        "29-exit-plan-mode" => vec![concat!(
            "Make a short plan to fix the spelling of the headings in README.md, ",
            "then call ExitPlanMode with it. ",
            "Once it is approved, make the fix with the Edit tool and report done."
        )],
        // The old "Don't answer": AskUserQuestion denied with an empty reason, the API's 400, then
        // one more send (the same 400).
        "30-deny-empty-message" => vec![ASK, "Say OK."],
        // A second message sent while the first turn ran: the CLI took it into that turn (one
        // result for both).
        "31-send-mid-turn" => vec![
            "Run the Bash command `sleep 8; echo done` and then tell me its output in one line.",
            "Also end your reply with the word hi.",
        ],
        // Interrupted while the foreground Bash ran: the turn ends with an error_during_execution
        // result.
        "32-interrupt-foreground" => vec![concat!(
            "Run the Bash command `sleep 30; echo fg-interrupt-done` in the foreground ",
            "and then tell me its output."
        )],
        // Three turns of one CLI with two rewind_files control requests between the second and the
        // third.
        "25-rewind-files" => vec![
            concat!(
                "Use the Write tool to create the file note.txt in the current directory containing exactly the ",
                "text: first"
            ),
            concat!(
                "Use the Read tool to read note.txt in the current directory, then use the Write tool to ",
                "overwrite note.txt with exactly the text: second"
            ),
            concat!(
                "Use the Read tool to read note.txt in the current directory and report its content exactly as ",
                "it is."
            ),
        ],
        // Two CLIs of one session; the second (`--resume --fork-session`) took the second prompt.
        "26-fork-session" => vec![
            "Run this exact bash command and report its output: echo kiwi-from-fork",
            concat!(
                "Reply in one line: the word forked, then a space, then the output of the command you ran ",
                "earlier."
            ),
        ],
        // Two CLIs of one session; the second (`--resume --fork-session --resume-session-at`) took
        // the last prompt.
        "27-resume-session-at" => vec![
            "Remember the word alpha. Reply with only: ok",
            "Remember the word bravo too. Reply with only: ok",
            "List every word I asked you to remember, comma separated, nothing else.",
        ],
        // Checkpoint 4. 33 turned the sandbox on and off with apply_flag_settings around one Bash
        // turn. The first CLI of 36 refused to start; the second, without the sandbox, took the
        // one Bash turn.
        "33-sandbox-live" | "36-sandbox-unavailable" => vec![SANDBOX_PROBE],
        // 34, 35 and 40 took control requests only (initialize and get_settings), no user turn.
        "34-sandbox-launch" | "35-sandbox-project-setting" | "40-sandbox-same-id" => vec![],
        "37-plan-auto" | "38-plan-bypass" => vec![PLAN_README],
        // Two CLIs of one session; the second (`--resume --settings`, in the sandbox) took the
        // Bash turn.
        "39-sandbox-resume" => vec![PONG, SANDBOX_PROBE],
        _ => return None,
    })
}

/// How the recorder answered each `can_use_tool`: 05 and 12 allowed (any wait), 13 allowed at
/// once (the no-answer path), 14 answered after 5 s, 15 let the AFK timeout run after 5 s. 16 and
/// 17 allowed, 18 answered both questions after 2 s. Only the decision comes back here: what else
/// the recorder sent (16's suggestions and rewritten input) reaches the projection through stdout.
fn answer(scenario: &str, request_id: &str) -> Option<PresenterInput> {
    let id = request_id.to_owned();
    let (decision, elapsed_ms) = match scenario {
        "05-permission-can-use-tool"
        | "12-subagent-permission"
        | "16-permission-suggestion-accept"
        | "17-edit-approval"
        | "25-rewind-files" => (ApprovalDecision::Allow { request_id: id }, 1_000),
        "13-ask-timeout" => (ApprovalDecision::Allow { request_id: id }, 0),
        "14-ask-answers-updatedinput" => (ApprovalDecision::Answered { request_id: id }, 5_000),
        "15-ask-afktimeout-updatedinput" => {
            (ApprovalDecision::AfkTimeout { request_id: id }, 5_000)
        }
        "18-ask-multi-question" => (ApprovalDecision::Answered { request_id: id }, 2_000),
        // Checkpoint 3: the plan's ExitPlanMode, then the Edit it planned; the recorder allowed
        // both at once.
        "29-exit-plan-mode" => (ApprovalDecision::Allow { request_id: id }, 0),
        "30-deny-empty-message" => (ApprovalDecision::Deny { request_id: id }, 0),
        // Checkpoint 4, all allowed at once: 36's Bash `touch` (the sandbox was not in force),
        // 37's ExitPlanMode, 38's ExitPlanMode and the Edit after it. 39 asked for nothing (the
        // sandbox ran its Bash), but would be allowed the same way. What else the recorder sent
        // (the setMode in updatedPermissions) reaches the projection through stdout.
        "36-sandbox-unavailable" | "37-plan-auto" | "38-plan-bypass" | "39-sandbox-resume" => {
            (ApprovalDecision::Allow { request_id: id }, 0)
        }
        _ => return None,
    };
    Some(PresenterInput::Decided(Decided {
        decision,
        elapsed_ms,
        passed_on: PassedOn::default(),
    }))
}

/// What the recorder asked the CLI for with a control request that the host's own record is for,
/// by the request's id (`recorder/scenarios.mjs`).
fn requests(scenario: &str) -> HashMap<String, ControlRequested> {
    let mut table = Requests {
        scenario,
        by_id: HashMap::new(),
    };
    match scenario {
        "06-context-usage" => table.put(ControlKind::Context, 2, None),
        "07-set-model-and-mode" => {
            for (index, model) in ["opus", "default", "sonnet", "default"].iter().enumerate() {
                table.put(ControlKind::Model, index + 2, Some(model));
            }
            let modes = [
                "plan",
                "acceptEdits",
                "bypassPermissions",
                "auto",
                "dontAsk",
                "manual",
            ];
            for (index, mode) in modes.iter().enumerate() {
                table.put(ControlKind::Mode, index + 6, Some(mode));
            }
        }
        // The recorder asked for the list four times, turned the server off and on, reconnected
        // it, and turned a name the CLI does not know off (req-1 is the initialize).
        "24-mcp-management" => {
            let name = Some("fake-echo");
            table.put(ControlKind::McpStatus, 2, None);
            table.put(ControlKind::McpDisable, 3, name);
            table.put(ControlKind::McpStatus, 4, None);
            table.put(ControlKind::McpEnable, 5, name);
            table.put(ControlKind::McpStatus, 6, None);
            table.put(ControlKind::McpReconnect, 7, name);
            table.put(ControlKind::McpStatus, 8, None);
            table.put(ControlKind::McpDisable, 9, Some("no-such-server"));
        }
        // The settings after the initialize (req-1), then an effort and the settings again, three
        // times. The last effort was null (the model's default): the host never sends one, so its
        // record has no value.
        "28-effort-live" => {
            table.put(ControlKind::Settings, 2, None);
            for (index, effort) in [Some("high"), Some("low"), None].into_iter().enumerate() {
                table.put(ControlKind::Effort, 3 + index * 2, effort);
                table.put(ControlKind::Settings, 4 + index * 2, None);
            }
        }
        // Checkpoint 4. The settings asked after each sandbox change, and 33's turning it off
        // (req-5). The apply_flag_settings that turned it on (33's req-3 and req-7, 36's req-3)
        // are not recorded: the host turns it on by restarting with --settings, never with that
        // request.
        "33-sandbox-live" => {
            for number in [2, 4, 6, 8] {
                table.put(ControlKind::Settings, number, None);
            }
            table.put(ControlKind::Sandbox, 5, Some("false"));
        }
        "36-sandbox-unavailable" => table.put(ControlKind::Settings, 4, None),
        "39-sandbox-resume" => table.put(ControlKind::Settings, 3, None),
        "40-sandbox-same-id" => {
            for number in [2, 4] {
                table.put(ControlKind::Settings, number, None);
            }
        }
        // The plan mode before the plan; 38 first asked for bypassPermissions, which was refused.
        "37-plan-auto" => table.put(ControlKind::Mode, 2, Some("plan")),
        "38-plan-bypass" => {
            table.put(ControlKind::Mode, 2, Some("bypassPermissions"));
            table.put(ControlKind::Mode, 3, Some("plan"));
        }
        _ => {}
    }
    table.by_id
}

struct Requests<'a> {
    scenario: &'a str,
    by_id: HashMap<String, ControlRequested>,
}

impl Requests<'_> {
    /// The request `<scenario>-req-<number>`, as the recorder named its ids.
    fn put(&mut self, kind: ControlKind, number: usize, value: Option<&str>) {
        let request_id = format!("{}-req-{number}", self.scenario);
        self.by_id.insert(
            request_id.clone(),
            ControlRequested {
                request_id,
                kind,
                value: value.map(str::to_owned),
            },
        );
    }
}

/// What the recorder sent with each message of `scenario`, from the stdin lines it kept: for each
/// user line, the points of the blocks ahead of its sentence. The recorder named no file, so the
/// names are the tests' own marks.
fn attached_of(scenario: &str) -> Vec<Vec<AttachmentRecord>> {
    let Some(stdin) = common::manifest_stdin(&format!("{scenario}.ndjson")) else {
        return Vec::new();
    };
    common::non_blank_lines(&common::text_of(&stdin.file))
        .iter()
        .map(|line| match serde_json::from_str::<Value>(line) {
            Ok(Value::Object(fields)) => fields,
            _ => panic!("{scenario}: a stdin line is not a JSON object"),
        })
        .filter(|line| line.string("type") == Some("user"))
        .map(
            |line| match line.obj("message").and_then(|it| it.get("content")) {
                Some(Value::Array(blocks)) => blocks
                    .iter()
                    .filter_map(Value::as_object)
                    .filter(|block| block.string("type") != Some("text"))
                    .enumerate()
                    .map(|(index, block)| attachment(scenario, index, block))
                    .collect(),
                _ => Vec::new(),
            },
        )
        .collect()
}

fn attachment(scenario: &str, index: usize, block: &Map<String, Value>) -> AttachmentRecord {
    let source = block
        .obj("source")
        .unwrap_or_else(|| panic!("{scenario}: an attachment block has no source"));
    let kind = if block.string("type") == Some("image") {
        AttachmentKind::Image
    } else {
        AttachmentKind::Document
    };
    let data = STANDARD
        .decode(source.string("data").unwrap_or_default())
        .unwrap_or_else(|e| panic!("{scenario}: an attachment's data is not base64: {e}"));
    AttachmentRecord {
        name: format!("attachment-{}", index + 1),
        kind,
        media_type: source.string("media_type").unwrap_or_default().to_owned(),
        size: i64::try_from(data.len()).unwrap_or(i64::MAX),
        path: None,
    }
}

/// The scenarios of the manifest, sorted.
pub fn scenarios() -> Vec<String> {
    let mut names: Vec<String> = common::manifest()
        .scenarios
        .into_iter()
        .map(|it| it.scenario)
        .collect();
    names.sort();
    names
}

/// The capture's events with the host's inputs put back where the recorder sent them. With
/// `uuids`, each message is sent under the uuid the recorder gave it (the `command_uuid` of its
/// lifecycle, which the CLI's record keeps as the user line's uuid: captures 25 and 27), as the
/// host does.
pub fn inputs(scenario: &str, uuids: bool) -> Vec<PresenterInput> {
    let sent = sent(scenario).unwrap_or_else(|| panic!("{scenario}: no SENT row"));
    let mut sent = sent.into_iter();
    let attached = attached_of(scenario);
    let requests = requests(scenario);
    let mut seen = HashSet::new();
    let mut inputs = Vec::new();
    let mut sends = 0;
    for event in common::read_capture(&format!("{scenario}.ndjson")) {
        if let AgentEvent::CommandLifecycle {
            command_uuid,
            state,
            ..
        } = &event
            && state == "queued"
            && seen.insert(command_uuid.clone())
        {
            sends += 1;
            let text = sent.next().unwrap_or_else(|| {
                panic!("{scenario}: the capture takes more messages than the scenario sent")
            });
            inputs.push(PresenterInput::UserSent(UserSent {
                message_id: SendId::new(&format!("send-{sends}"))
                    .unwrap_or_else(|| panic!("send-{sends} is a key")),
                text: text.to_owned(),
                attachments: attached.get(sends - 1).cloned().unwrap_or_default(),
                uuid: uuids.then(|| command_uuid.clone()),
            }));
        }
        // The host records a request before it sends it, so before the CLI's answer to it.
        if let AgentEvent::ControlResponse {
            request_id: Some(request_id),
            ..
        } = &event
            && let Some(request) = requests.get(request_id)
        {
            inputs.push(PresenterInput::ControlRequested(request.clone()));
        }
        let answered = match &event {
            AgentEvent::ControlRequest { request_id, .. } => Some(
                answer(scenario, request_id)
                    .unwrap_or_else(|| panic!("{scenario}: no ANSWERS row for {request_id}")),
            ),
            _ => None,
        };
        inputs.push(PresenterInput::Event(event));
        inputs.extend(answered);
    }
    assert!(
        sent.next().is_none(),
        "{scenario}: the scenario sent more than the capture shows taken"
    );
    inputs
}

/// One input and everything after it.
#[derive(Clone, Debug)]
pub struct Step {
    pub input: PresenterInput,
    pub view: SessionView,
    pub tree: Value,
}

/// Folds core and the transcript per input, as the host does, and projects after every input.
pub fn replay(scenario: &str) -> Vec<Step> {
    replay_with(scenario, false)
}

/// [`replay`], each message sent under its uuid when `uuids` (see [`inputs`]).
pub fn replay_with(scenario: &str, uuids: bool) -> Vec<Step> {
    let mut view = SessionView::default();
    inputs(scenario, uuids)
        .into_iter()
        .map(|input| {
            view = std::mem::take(&mut view).fold(&input);
            let tree = project_tree(&view.conversation, &view.transcript, THREAD);
            Step {
                input,
                view: view.clone(),
                tree,
            }
        })
        .collect()
}

/// The tree after the last input of `scenario`: the last step's tree of [`replay`], projected
/// once (the projector has no memo, so the trees on the way change nothing).
pub fn final_tree(scenario: &str) -> Value {
    let view = inputs(scenario, false)
        .iter()
        .fold(SessionView::default(), SessionView::fold);
    project_tree(&view.conversation, &view.transcript, THREAD)
}
