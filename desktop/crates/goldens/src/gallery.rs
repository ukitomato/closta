//! The gallery's made-up conversation (GallerySession.kt's `view(Waits.ALL)`) as a replay file: an
//! ask, thinking, tool lines (one folded into Explored, one failed, a sub-agent), a to-do list, a
//! reply with a code block and a table, an allowed Bash card, a turn's end, and then, waiting, a
//! Bash card, a question card with two questions, a plan card and an Edit card. The requests are
//! in the shapes of captures 14 / 18 (AskUserQuestion), 16 / 17 (permission, Edit) and 29
//! (ExitPlanMode). Nothing in it comes from a real session.
//!
//! What the host does becomes a cue: a send is a user cue, an allow or a deny of the first turn's
//! requests an answer cue. The attachments of the first ask are dropped (a replay's stdin cannot
//! send them), and so are the turn's changed files, which the host looks up rather than reads from
//! stdout.

use closta_providers::claude::fake::replay::{ReplayCue, ReplayLine};
use serde_json::{Map, Value, json};

use crate::synthetic::stream_script::{self, StreamScript};

const SESSION: &str = "gallery";
const SYNTHETIC_MODEL: &str = "claude-synthetic";
const ASK: &str = "Retry up to 3 times when login fails. Fix AuthServiceTest.kt too";
const SECOND_ASK: &str = "Fix the tests too, and show me a plan when you're done";
const BASH_ID: &str = "gallery-r2";
const QUESTION_ID: &str = "gallery-r3";
const PLAN_ID: &str = "gallery-r4";
const EDIT_ID: &str = "gallery-r5";

const LONG_ERROR: &str = "e: file:///work/src/auth/AuthService.kt:42:17 Unresolved reference 'retry' while resolving the call \
     AuthService.login(Credentials) from LoginController.onSubmit(LoginForm) in module :auth, \
     the compiler also cannot infer the type of the lambda passed to it, so nothing after it was checked";

const REPLY: &str = "Done. When `login` fails, it waits 200ms and tries again, up to 3 times.

```kotlin
suspend fun login(c: Credentials) = retry(times = 3, backoff = 200.milliseconds) {
    api.login(c)
}
```

- Only an `IOException` counts (an authentication failure returns at once)
- I added 2 tests to `AuthServiceTest`

| Case | Calls | Result |
|---|---|---|
| All 3 fail | 3 | Exception |
| Second try succeeds | 2 | Success |";

const PLAN: &str = "# Retry tests

1. Add a case to `AuthServiceTest` where all 3 tries fail
2. Swap in a fake clock so the waits take no time
3. Check with `./gradlew :auth:test`";

/// The whole conversation: the first turn finished, the second waiting on all four requests.
pub fn replay_lines() -> Vec<ReplayLine> {
    let mut builder = Builder {
        script: StreamScript::with_model(SESSION, SYNTHETIC_MODEL),
        out: Vec::new(),
        taken: 0,
    };
    builder.first_turn();
    builder.second_turn();
    builder.flush();
    builder.out
}

struct Builder {
    script: StreamScript,
    out: Vec<ReplayLine>,
    /// How many of the script's lines are already in `out`.
    taken: usize,
}

impl Builder {
    fn flush(&mut self) {
        let lines = self.script.lines();
        self.out
            .extend(lines[self.taken..].iter().cloned().map(ReplayLine::Stdout));
        self.taken = lines.len();
    }

    fn line(&mut self, json: &Value) {
        self.flush();
        self.out.push(ReplayLine::Stdout(json.to_string()));
    }

    fn cue(&mut self, cue: ReplayCue) {
        self.flush();
        self.out.push(ReplayLine::Cue(cue));
    }

    fn sent(&mut self, text: &str) {
        self.cue(ReplayCue::User {
            text: text.to_owned(),
        });
    }

    fn answer(&mut self, request_id: &str, allow: bool) {
        self.cue(ReplayCue::Answer {
            request_id: request_id.to_owned(),
            allow,
        });
    }

    fn assistant(&mut self, message_id: &str, blocks: Vec<Value>) {
        self.script.assistant(message_id, blocks, None);
    }

    fn tool_result(&mut self, tool_id: &str, content: &str) {
        self.script.tool_result(tool_id, content, None, false);
    }

    fn tool_failed(&mut self, tool_id: &str, content: &str) {
        self.script.tool_result(tool_id, content, None, true);
    }

    fn tool(&mut self, message_id: &str, tool_id: &str, name: &str, input: Value) {
        self.assistant(
            message_id,
            vec![stream_script::tool_use(tool_id, name, input)],
        );
    }

    fn first_turn(&mut self) {
        self.sent(ASK);
        self.script.lifecycle("gallery-c1", "queued");
        self.script.lifecycle("gallery-c1", "started");
        self.script.init();
        self.assistant(
            "gm1",
            vec![thinking(
                "Find where the retry belongs. AuthService.login calls the API.",
            )],
        );
        self.tool(
            "gm2",
            "gt1",
            "Read",
            json!({ "file_path": "/work/src/AuthService.kt" }),
        );
        self.tool_result("gt1", "class AuthService");
        self.tool("gm3", "gt2", "Grep", json!({ "pattern": "login\\(" }));
        self.tool_result("gt2", "3 matches");
        self.tool(
            "gm4",
            "gt3",
            "Bash",
            json!({ "command": "./gradlew :auth:compileKotlin --offline" }),
        );
        self.tool_failed("gt3", "e: AuthService.kt:42: Unresolved reference: retry");
        self.tool(
            "gm5",
            "gt4",
            "Agent",
            json!({
                "description": "Find the callers",
                "prompt": "List every caller of AuthService.login",
            }),
        );
        self.tool_result("gt4", "Two callers: LoginController and TokenRefresher");
        self.tool(
            "gm6",
            "gt5",
            "TodoWrite",
            json!({
                "todos": [
                    todo("Decide how to retry", "completed"),
                    todo("Fix AuthService", "in_progress"),
                    todo("Add tests and run them", "pending"),
                ],
            }),
        );
        self.tool_result("gt5", "Todos have been modified successfully.");
        let test = "./gradlew :auth:test --tests '*AuthServiceTest'";
        self.assistant(
            "gm7",
            vec![
                stream_script::text(
                    "I'll put the retry in `AuthService.login`. Only an `IOException` counts.",
                ),
                stream_script::tool_use(
                    "gt6",
                    "Bash",
                    json!({ "command": test, "description": "Run tests" }),
                ),
            ],
        );
        self.line(&can_use_tool(
            "gallery-r1",
            "Bash",
            "gt6",
            json!({ "command": test }),
            None,
        ));
        self.answer("gallery-r1", true);
        self.tool_result("gt6", "BUILD SUCCESSFUL in 12s");
        self.more_rows();
        self.assistant("gm8", vec![stream_script::text(REPLY)]);
        self.flush();
        let mut result = StreamScript::new(SESSION);
        result.result("done");
        let mut result: Value = result
            .lines()
            .first()
            .and_then(|line| serde_json::from_str(line).ok())
            .unwrap_or_else(|| panic!("a result line"));
        result["user_message_uuid"] = "gallery-c1".into();
        result["duration_ms"] = 23_000.into();
        self.line(&result);
        self.script.lifecycle("gallery-c1", "completed");
        self.flush();
    }

    /// Rows the next fixes look at: an Explored group to open, an empty row, long ones, three
    /// answers.
    fn more_rows(&mut self) {
        self.assistant(
            "gm20",
            vec![
                stream_script::tool_use(
                    "gt20",
                    "Read",
                    json!({ "file_path": "/work/src/RetryPolicy.kt" }),
                ),
                stream_script::tool_use(
                    "gt21",
                    "Read",
                    json!({ "file_path": "/work/src/AuthServiceTest.kt" }),
                ),
                stream_script::tool_use("gt22", "Grep", json!({ "pattern": "RetryPolicy" })),
            ],
        );
        self.tool_result("gt20", "class RetryPolicy(val times: Int)\n");
        self.tool_result(
            "gt21",
            "class AuthServiceTest {\n    @Test fun logsIn() {}\n}\n",
        );
        self.tool_result("gt22", "src/AuthService.kt:12\nsrc/RetryPolicy.kt:3");
        self.tool("gm21", "gt23", "WebFetch", json!({}));
        self.tool_result("gt23", "");
        self.tool(
            "gm22",
            "gt24",
            "Bash",
            json!({ "command": "ls -1 /work/src/auth/generated" }),
        );
        let generated: Vec<String> = (1..=16).map(|it| format!("Generated{it:02}.kt")).collect();
        self.tool_result("gt24", &generated.join("\n"));
        self.tool(
            "gm23",
            "gt25",
            "Bash",
            json!({ "command": "./gradlew :auth:lint --offline" }),
        );
        self.tool_failed("gt25", LONG_ERROR);
        let write = json!({
            "file_path": "/work/src/RetryPolicy.kt",
            "content": "class RetryPolicy(val times: Int)\n",
        });
        self.tool("gm24", "gt26", "Write", write.clone());
        self.line(&can_use_tool("gallery-r6", "Write", "gt26", write, None));
        self.answer("gallery-r6", true);
        self.tool_result(
            "gt26",
            "File created successfully at: /work/src/RetryPolicy.kt",
        );
        let remove = json!({ "command": "rm -rf /work/build/tmp" });
        self.tool("gm25", "gt27", "Bash", remove.clone());
        self.line(&can_use_tool("gallery-r7", "Bash", "gt27", remove, None));
        self.answer("gallery-r7", false);
        self.tool_failed(
            "gt27",
            "The user doesn't want to proceed with this tool use.",
        );
    }

    fn second_turn(&mut self) {
        self.sent(SECOND_ASK);
        self.script.lifecycle("gallery-c2", "queued");
        self.script.lifecycle("gallery-c2", "started");
        self.assistant(
            "gm9",
            vec![thinking("Check the test names, then ask how far to go.")],
        );
        let command = "git status --short | awk '{print $1}' | sort | uniq -c; \
             git status --short | grep -v '^ D .agents/' | head -40; \
             git log -3 --format='%h %ad %s' --date=iso";
        self.assistant(
            "gm10",
            vec![
                stream_script::text("First I'll look at what is changed in the working tree."),
                stream_script::tool_use("gt7", "Bash", json!({ "command": command })),
            ],
        );
        self.line(&can_use_tool(
            BASH_ID,
            "Bash",
            "gt7",
            json!({ "command": command }),
            Some(json!([{
                "type": "addRules",
                "rules": [{ "toolName": "Bash", "ruleContent": "git status:*" }],
                "behavior": "allow",
                "destination": "localSettings",
            }])),
        ));
        let questions = json!({
            "questions": [
                question(
                    "How long should it wait between retries?",
                    "Delay",
                    &[
                        ("Fixed 200ms", "Waits the same every time. The simplest"),
                        ("読み取りとログと計測だけ外して再試行する", "Leaves the writes as they are"),
                        (
                            "Exponential backoff (doubling from 200ms, capped at 2 seconds, with jitter) \
                             so that clients do not all hit a busy server again at the same moment",
                            "Gentler on a busy server. The tests swap in a fake clock",
                        ),
                    ],
                ),
                question(
                    "Which tests should I add?",
                    "Tests",
                    &[
                        ("Up to 3 failures", "Only checks that it gives up on the third try"),
                        ("Success and failure", "Also checks that it stops once a try succeeds"),
                    ],
                ),
            ],
        });
        self.tool("gm11", "gt8", "AskUserQuestion", questions.clone());
        self.line(&can_use_tool(
            QUESTION_ID,
            "AskUserQuestion",
            "gt8",
            questions,
            None,
        ));
        let plan = json!({ "plan": PLAN, "planFilePath": "/home/user/.claude/plans/gallery.md" });
        self.tool("gm12", "gt9", "ExitPlanMode", plan.clone());
        self.line(&can_use_tool(PLAN_ID, "ExitPlanMode", "gt9", plan, None));
        let edit = json!({
            "file_path": "/work/src/AuthService.kt",
            "old_string": "    fun login(c: Credentials) = api.login(c)",
            "new_string": "    suspend fun login(c: Credentials) = retry(times = 3) {\n        api.login(c)\n    }",
            "replace_all": false,
        });
        self.tool("gm13", "gt10", "Edit", edit.clone());
        self.line(&can_use_tool(
            EDIT_ID,
            "Edit",
            "gt10",
            edit,
            Some(json!([
                { "type": "setMode", "mode": "acceptEdits", "destination": "session" },
            ])),
        ));
    }
}

fn thinking(text: &str) -> Value {
    json!({ "type": "thinking", "thinking": text, "signature": "gallery" })
}

fn todo(content: &str, status: &str) -> Value {
    json!({ "content": content, "status": status, "activeForm": content })
}

fn question(text: &str, header: &str, options: &[(&str, &str)]) -> Value {
    let options: Vec<Value> = options
        .iter()
        .map(|(label, description)| json!({ "label": label, "description": description }))
        .collect();
    json!({
        "question": text,
        "header": header,
        "options": options,
        "multiSelect": false,
    })
}

/// A `can_use_tool` request in the shape of captures 16 / 17.
fn can_use_tool(
    request_id: &str,
    tool: &str,
    tool_use_id: &str,
    input: Value,
    suggestions: Option<Value>,
) -> Value {
    let mut request = Map::new();
    request.insert("subtype".into(), "can_use_tool".into());
    request.insert("tool_name".into(), tool.into());
    request.insert("display_name".into(), tool.into());
    request.insert("input".into(), input);
    if let Some(suggestions) = suggestions {
        request.insert("permission_suggestions".into(), suggestions);
    }
    request.insert("tool_use_id".into(), tool_use_id.into());
    json!({
        "type": "control_request",
        "request_id": request_id,
        "request": request,
    })
}
