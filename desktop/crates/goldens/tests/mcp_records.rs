//! What the transcript and the tree keep of the MCP servers: the list the CLI gave (capture 24 and
//! lines made by hand for what the capture did not record), the refusals of a switch, the sentences
//! that are made safe, and the two columns of waiting requests that must not push each other out
//! (McpRecordsTest.kt). Every secret in the tests is an obvious made-up mark.
//!
//! Not ported: Kotlin holds each tree to the contract (`TreeChecks`), which stays on the Kotlin
//! side. Kotlin also checks that a request leaves the tree's message nodes the same objects and
//! that its projection's `Context` compares as the same, both of which only its `ProjectionMemo`
//! keeps; those tests check the transcript and the tree by value instead.

use std::sync::Arc;

use closta_goldens::lines::{self, quote};
use closta_goldens::projector::project_tree;
use closta_goldens::replay::{THREAD, inputs};
use closta_goldens::tree_reading::at;
use closta_model::AgentEvent;
use closta_presenter::input::{ControlRequested, Launched, PresenterInput, SendId, UserSent};
use closta_presenter::json::compact;
use closta_presenter::records::mcp::{McpServerRecord, mcp_sentence};
use closta_presenter::records::operations::{
    ControlKind, MAX_WAITING, OperationRecords, SwitchKind, SwitchOutcome,
};
use closta_presenter::session::SessionView;
use closta_presenter::text::utf16_len;
use serde_json::{Map, Value, json};

#[derive(Clone, Default)]
struct Host(SessionView);

impl Host {
    fn with(&self, input: PresenterInput) -> Host {
        Host(self.0.clone().fold(&input))
    }

    fn event(&self, event: AgentEvent) -> Host {
        self.with(PresenterInput::Event(event))
    }

    fn request(&self, id: &str, kind: ControlKind, value: Option<&str>) -> Host {
        self.with(PresenterInput::ControlRequested(ControlRequested {
            request_id: id.into(),
            kind,
            value: value.map(str::to_owned),
        }))
    }

    fn answer(&self, id: &str, servers: &str) -> Host {
        self.event(lines::control_ok(
            id,
            Some(&format!(r#"{{"mcpServers":{servers}}}"#)),
        ))
    }

    fn pressed(&self, kind: ControlKind, name: &str) -> Host {
        self.request("s1", kind, Some(name))
    }

    fn ended(&self, ok: bool) -> Host {
        self.event(if ok {
            lines::control_ok("s1", None)
        } else {
            lines::control_error("s1", "no")
        })
    }

    fn ops(&self) -> &OperationRecords {
        &self.0.transcript.operations
    }

    fn listed(&self) -> Vec<McpServerRecord> {
        self.ops()
            .mcp_servers
            .as_deref()
            .unwrap_or_else(|| panic!("a list"))
            .to_vec()
    }

    fn tree(&self) -> Value {
        project_tree(&self.0.conversation, &self.0.transcript, THREAD)
    }

    fn thread(&self) -> Map<String, Value> {
        at(&self.tree(), &["threads", "byId", THREAD]).clone()
    }

    fn servers(&self) -> Vec<Map<String, Value>> {
        self.thread()
            .get("mcpServers")
            .and_then(Value::as_array)
            .unwrap_or_else(|| panic!("a list in the tree"))
            .iter()
            .map(|it| it.as_object().unwrap_or_else(|| panic!("a server")).clone())
            .collect()
    }
}

fn server(name: &str, status: &str, source: &str, tools: &[&str]) -> McpServerRecord {
    McpServerRecord {
        name: name.into(),
        status: status.into(),
        source: source.into(),
        tools: tools.iter().map(|it| (*it).to_owned()).collect(),
        error: None,
    }
}

fn replayed(scenario: &str) -> Host {
    inputs(scenario, false)
        .iter()
        .fold(Host::default(), |state, input| state.with(input.clone()))
}

fn text(node: &Map<String, Value>, key: &str) -> String {
    node.get(key)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("no string '{key}'"))
        .to_owned()
}

#[test]
fn capture_24_the_last_answer_holds_the_server_by_name_state_source_and_tool_names_and_none_of_its_configuration()
 {
    let state = replayed("24-mcp-management");
    assert_eq!(
        vec![server("fake-echo", "connected", "dynamic", &["echo"])],
        state.listed()
    );
    assert!(!state.ops().mcp_unreadable);
    let tree = compact(&Value::Object(state.thread()));
    let records = format!("{:?}", state.ops());
    // The capture's config holds a URL (an obvious made-up port): neither the record nor the tree
    // carries it.
    for leak in [
        "localhost",
        "39039",
        "\"config\":",
        "\"url\":",
        "serverInfo",
    ] {
        assert!(!tree.contains(leak), "the tree has no {leak}");
        assert!(!records.contains(leak), "the records have no {leak}");
    }
    assert_eq!(
        vec![("fake-echo".to_owned(), "connected".to_owned())],
        state
            .servers()
            .iter()
            .map(|it| (text(it, "name"), text(it, "status")))
            .collect::<Vec<_>>()
    );
}

#[test]
fn capture_24_the_switches_in_order_three_applied_and_the_unknown_name_rejected_with_the_clis_sentence()
 {
    let state = replayed("24-mcp-management");
    let switches = &state.ops().switches;
    assert_eq!(
        vec![
            SwitchKind::McpDisable,
            SwitchKind::McpEnable,
            SwitchKind::McpReconnect,
            SwitchKind::McpDisable
        ],
        switches.iter().map(|it| it.kind).collect::<Vec<_>>()
    );
    assert_eq!(
        vec!["fake-echo", "fake-echo", "fake-echo", "no-such-server"],
        switches
            .iter()
            .map(|it| it.value.as_str())
            .collect::<Vec<_>>()
    );
    assert_eq!(
        vec![
            SwitchOutcome::Applied,
            SwitchOutcome::Applied,
            SwitchOutcome::Applied,
            SwitchOutcome::Rejected
        ],
        switches.iter().map(|it| it.outcome).collect::<Vec<_>>()
    );
    assert_eq!(
        Some("Server not found: no-such-server"),
        switches.last().and_then(|it| it.detail.as_deref())
    );
}

#[test]
fn a_state_the_host_does_not_know_reads_as_unknown_a_nameless_server_is_left_out_and_tools_are_names_only()
 {
    let state = Host::default()
        .request("m1", ControlKind::McpStatus, None)
        .answer(
            "m1",
            r#"[
            {"name":"a","status":"sleeping","scope":"project","tools":[{"name":"t1","description":"D","annotations":{"x":1}},{"x":2}]},
            {"status":"connected"},
            {"name":"b","status":"needs-auth","source":"user","scope":"project"}
            ]"#,
        );
    assert_eq!(
        vec![
            server("a", "unknown", "project", &["t1"]),
            server("b", "needs-auth", "user", &[]),
        ],
        state.listed()
    );
    let tree = compact(&Value::Object(state.thread()));
    assert!(
        !(tree.contains("\"D\"") || tree.contains("annotations")),
        "a tool's description and annotations are not read"
    );
}

#[test]
fn the_answer_is_cut_at_100_servers_and_64_tools_each() {
    let tools = (1..=70)
        .map(|it| format!(r#"{{"name":"t{it}"}}"#))
        .collect::<Vec<_>>()
        .join(",");
    let many = (1..=120)
        .map(|it| format!(r#"{{"name":"s{it}","status":"connected","tools":[{tools}]}}"#))
        .collect::<Vec<_>>()
        .join(",");
    let state = Host::default()
        .request("m1", ControlKind::McpStatus, None)
        .answer("m1", &format!("[{many}]"));
    let listed = state.listed();
    assert_eq!(100, listed.len());
    assert_eq!(64, listed[0].tools.len());
}

#[test]
fn a_secret_in_the_configuration_or_the_headers_or_the_env_never_reaches_a_record_a_tree_or_a_log_line()
 {
    let mark = "SECRET-MARK-0001";
    let body = format!(
        concat!(
            r#"[{{"name":"s","status":"connected","source":"dynamic","#,
            r#""config":{{"type":"http","url":"https://host.example/mcp?token={mark}","headers":{{"Authorization":"Bearer {mark}"}},"#,
            r#""command":"run-{mark}","args":["--key={mark}"],"env":{{"KEY":"{mark}"}}}},"#,
            r#""serverInfo":{{"name":"{mark}","version":"1"}}}}]"#
        ),
        mark = mark
    );
    let state = Host::default()
        .request("m1", ControlKind::McpStatus, None)
        .answer("m1", &body);
    assert!(!format!("{:?}", state.ops()).contains(mark));
    assert!(!compact(&Value::Object(state.thread())).contains(mark));
    assert_eq!(1, state.listed().len());
}

#[test]
fn an_error_sentence_is_the_first_line_200_characters_its_urls_without_userinfo_and_query() {
    let secret = "SECRET-MARK-0002";
    let long = "x".repeat(300);
    let error = format!(
        "Failed to connect to https://user:{secret}@host.example/mcp?token={secret}#frag now\nsecond line {secret}\n{long}"
    );
    let state = Host::default()
        .request("m1", ControlKind::McpStatus, None)
        .answer(
            "m1",
            &format!(
                r#"[{{"name":"s","status":"failed","error":{}}}]"#,
                quote(&error)
            ),
        );
    assert_eq!(
        Some("Failed to connect to https://host.example/mcp now"),
        state.listed()[0].error.as_deref()
    );
    assert!(!compact(&Value::Object(state.thread())).contains(secret));
    let cut = Host::default()
        .request("m1", ControlKind::McpStatus, None)
        .answer(
            "m1",
            &format!(
                r#"[{{"name":"s","status":"failed","error":{}}}]"#,
                quote(&long)
            ),
        );
    assert_eq!(
        200,
        utf16_len(
            cut.listed()[0]
                .error
                .as_deref()
                .unwrap_or_else(|| panic!("a sentence"))
        )
    );
}

#[test]
fn a_url_cleaned_before_the_cut_cannot_leave_the_front_of_a_secret() {
    let secret = "SECRET-MARK-0003";
    let padding = "p".repeat(180);
    let sentence = mcp_sentence(&format!(
        "{padding} https://u:{secret}@h.example/a?k={secret}"
    ));
    assert!(!sentence.contains("SECRET"), "{sentence}");
    assert_eq!(format!("{padding} https://h.example/a"), sentence);
}

#[test]
fn a_switch_refusal_about_an_mcp_server_is_cut_at_200_a_model_refusal_keeps_its_500() {
    let long = "y".repeat(450);
    let state = Host::default()
        .request("a", ControlKind::McpDisable, Some("s"))
        .request("b", ControlKind::Model, Some("opus"))
        .event(lines::control_error("a", &long))
        .event(lines::control_error("b", &long));
    let detail = |kind: SwitchKind| {
        state
            .ops()
            .switches
            .iter()
            .find(|it| it.kind == kind)
            .and_then(|it| it.detail.as_deref())
            .map(utf16_len)
    };
    assert_eq!(Some(200), detail(SwitchKind::McpDisable));
    assert_eq!(Some(450), detail(SwitchKind::Model));
}

#[test]
fn a_control_errors_notice_is_made_as_an_mcp_sentence_whatever_the_request_was() {
    let secret = "SECRET-MARK-0004";
    let state = Host::default()
        .request("a", ControlKind::Model, Some("opus"))
        .event(lines::control_error(
            "a",
            &format!("no https://u:{secret}@h.example/x?q={secret}\nmore"),
        ));
    let thread = state.thread();
    let notice = thread
        .get("notices")
        .and_then(Value::as_object)
        .and_then(|it| it.get("byId"))
        .and_then(Value::as_object)
        .and_then(|it| it.get("notice-1"))
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("a notice"));
    assert_eq!("no https://h.example/x", text(notice, "text"));
}

#[test]
fn an_error_answer_or_a_request_that_could_not_be_written_marks_the_list_unreadable_and_keeps_the_last_one()
 {
    let listed = Host::default()
        .request("m1", ControlKind::McpStatus, None)
        .answer("m1", r#"[{"name":"s","status":"connected"}]"#);
    let failed = listed
        .request("m2", ControlKind::McpStatus, None)
        .event(lines::control_error("m2", "boom"));
    assert!(failed.ops().mcp_unreadable);
    assert_eq!(listed.ops().mcp_servers, failed.ops().mcp_servers);
    assert_eq!(
        Some(&Value::Bool(true)),
        failed.thread().get("mcpServersUnreadable")
    );
    assert_eq!(1, failed.servers().len());
    let unsent = listed
        .request("m3", ControlKind::McpStatus, None)
        .with(PresenterInput::ControlSendFailed("m3".into()));
    assert!(unsent.ops().mcp_unreadable);
    assert!(unsent.ops().mcp_waiting.is_empty());
    assert_eq!(listed.ops().mcp_servers, unsent.ops().mcp_servers);
    // A body that is no list is not an answer to read either.
    let odd = listed
        .request("m4", ControlKind::McpStatus, None)
        .event(lines::control_ok("m4", Some(r#"{"x":1}"#)));
    assert!(odd.ops().mcp_unreadable);
    // The next list that can be read clears it.
    let again = failed
        .request("m5", ControlKind::McpStatus, None)
        .answer("m5", "[]");
    assert!(!again.ops().mcp_unreadable);
    assert_eq!(None, again.thread().get("mcpServersUnreadable"));
    assert_eq!(Vec::<McpServerRecord>::new(), again.listed());
    assert_eq!(Some(&json!([])), again.thread().get("mcpServers"));
}

#[test]
fn the_tree_has_no_list_before_the_first_answer() {
    assert_eq!(None, Host::default().thread().get("mcpServers"));
    assert_eq!(
        None,
        Host::default()
            .request("m1", ControlKind::McpStatus, None)
            .thread()
            .get("mcpServers")
    );
}

#[test]
fn usage_requests_and_list_requests_wait_in_their_own_columns_and_do_not_push_each_other_out() {
    let ids = |prefix: &str, range: std::ops::RangeInclusive<usize>| -> Vec<String> {
        range.map(|it| format!("{prefix}{it}")).collect()
    };
    let mut state = Host::default().request("c0", ControlKind::Context, None);
    for n in 1..=MAX_WAITING + 2 {
        state = state.request(&format!("m{n}"), ControlKind::McpStatus, None);
    }
    assert_eq!(
        vec!["c0".to_owned()],
        state.ops().waiting.iter().cloned().collect::<Vec<_>>()
    );
    assert_eq!(
        ids("m", 3..=MAX_WAITING + 2),
        state.ops().mcp_waiting.iter().cloned().collect::<Vec<_>>()
    );
    let mut other = Host::default().request("m0", ControlKind::McpStatus, None);
    for n in 1..=MAX_WAITING + 2 {
        other = other.request(&format!("c{n}"), ControlKind::Context, None);
    }
    assert_eq!(
        vec!["m0".to_owned()],
        other.ops().mcp_waiting.iter().cloned().collect::<Vec<_>>()
    );
    // The same id twice is one wait.
    let twice = other.request("m0", ControlKind::McpStatus, None);
    assert_eq!(
        vec!["m0".to_owned()],
        twice.ops().mcp_waiting.iter().cloned().collect::<Vec<_>>()
    );
    assert!(Arc::ptr_eq(
        &other.0.transcript.operations,
        &twice.0.transcript.operations
    ));
}

#[test]
fn asking_for_the_list_and_its_answer_leave_every_message_the_same() {
    let base = Host::default()
        .with(PresenterInput::UserSent(UserSent {
            message_id: SendId::new("send-1").unwrap_or_else(|| panic!("a key")),
            text: "hello".into(),
            attachments: Vec::new(),
            uuid: None,
        }))
        .event(lines::queued("cmd-1"))
        .event(lines::started("cmd-1"));
    let before = base.tree();
    let asked = base.request("m1", ControlKind::McpStatus, None);
    let waiting = asked.tree();
    let messages = |tree: &Value| at(tree, &["threads", "byId", THREAD, "messages"]).clone();
    assert_eq!(messages(&before), messages(&waiting));
    assert_eq!(before, waiting, "a request alone shows nothing new");
    assert!(
        asked
            .0
            .transcript
            .messages
            .same(&base.0.transcript.messages),
        "the messages are the very same"
    );
    let answered = asked.answer("m1", r#"[{"name":"s","status":"connected"}]"#);
    assert_eq!(messages(&before), messages(&answered.tree()));
    assert!(
        answered
            .0
            .transcript
            .messages
            .same(&base.0.transcript.messages)
    );
}

#[test]
fn the_tree_ignores_the_requests_waiting_and_shows_a_new_list_or_a_failure() {
    let base = Host::default().request("c0", ControlKind::Context, None);
    let asked = base.request("m1", ControlKind::McpStatus, None);
    assert_eq!(base.tree(), asked.tree());
    let listed = asked.answer("m1", r#"[{"name":"s","status":"connected"}]"#);
    assert_ne!(asked.tree(), listed.tree());
    let unreadable = asked.with(PresenterInput::ControlSendFailed("m1".into()));
    assert_ne!(asked.tree(), unreadable.tree());
}

fn listed_with(status: &str) -> Host {
    Host::default()
        .request("m1", ControlKind::McpStatus, None)
        .answer(
            "m1",
            &format!(
                r#"[{{"name":"fake-echo","status":"{status}","tools":[{{"name":"echo"}}],"error":"old failure"}},
                {{"name":"other","status":"connected"}}]"#
            ),
        )
}

#[test]
fn a_turn_off_that_is_applied_writes_disabled_into_the_last_list_without_tools_or_sentence_until_a_new_list()
 {
    let applied = listed_with("connected")
        .pressed(ControlKind::McpDisable, "fake-echo")
        .ended(true);
    let written = applied.listed();
    assert_eq!(server("fake-echo", "disabled", "", &[]), written[0]);
    assert_eq!(
        "connected",
        written.last().unwrap_or_else(|| panic!("two")).status,
        "another server is left as it was"
    );
    assert_eq!("disabled", text(&applied.servers()[0], "status"));
    // The CLI's own list that comes after replaces what was written.
    let again = applied
        .request("m2", ControlKind::McpStatus, None)
        .answer("m2", r#"[{"name":"fake-echo","status":"disabled"}]"#);
    assert_eq!(1, again.listed().len());
    assert_eq!("disabled", again.listed()[0].status);
}

#[test]
fn a_turn_on_that_is_applied_makes_a_disabled_server_connecting_and_leaves_one_that_is_not_disabled()
 {
    let on = listed_with("disabled")
        .pressed(ControlKind::McpEnable, "fake-echo")
        .ended(true);
    assert_eq!(server("fake-echo", "pending", "", &[]), on.listed()[0]);
    let already = listed_with("connected")
        .pressed(ControlKind::McpEnable, "fake-echo")
        .ended(true);
    assert_eq!(listed_with("connected").listed(), already.listed());
}

#[test]
fn a_reconnect_a_refusal_a_failed_send_a_name_the_list_lacks_and_no_list_at_all_write_nothing() {
    let base = listed_with("failed");
    assert_eq!(
        base.listed(),
        base.pressed(ControlKind::McpReconnect, "fake-echo")
            .ended(true)
            .listed()
    );
    assert_eq!(
        base.listed(),
        base.pressed(ControlKind::McpDisable, "fake-echo")
            .ended(false)
            .listed()
    );
    let unsent = base
        .pressed(ControlKind::McpDisable, "fake-echo")
        .with(PresenterInput::ControlSendFailed("s1".into()));
    assert_eq!(base.listed(), unsent.listed());
    assert_eq!(
        base.listed(),
        base.pressed(ControlKind::McpDisable, "gone")
            .ended(true)
            .listed()
    );
    assert_eq!(
        None,
        Host::default()
            .pressed(ControlKind::McpDisable, "fake-echo")
            .ended(true)
            .ops()
            .mcp_servers
    );
    // An end seen twice writes once: a late error for an applied switch changes nothing.
    let twice = base
        .pressed(ControlKind::McpDisable, "fake-echo")
        .ended(true)
        .ended(false);
    assert_eq!("disabled", twice.listed()[0].status);
}

#[test]
fn a_userinfo_that_holds_a_raw_slash_question_mark_or_hash_is_gone_from_the_sentence_whatever_it_holds()
 {
    let secret = "SECRET-MARK-0005";
    for url in [
        format!("https://user:pa/ss{secret}@host.example/x"),
        format!("https://u:p?w{secret}@h.example/x"),
        format!("https://u:p#w{secret}@h.example/x"),
    ] {
        let sentence = mcp_sentence(&format!("cannot reach {url} now"));
        assert!(!sentence.contains("SECRET"), "{sentence}");
        assert!(sentence.starts_with("cannot reach https://"), "{sentence}");
    }
    assert_eq!(
        "cannot reach https://h.example/x now",
        mcp_sentence("cannot reach https://u:p?w@h.example/x now")
    );
}

#[test]
fn an_empty_source_falls_back_to_the_scope() {
    let state = Host::default()
        .request("m1", ControlKind::McpStatus, None)
        .answer(
            "m1",
            r#"[{"name":"a","status":"connected","source":"","scope":"project"},
            {"name":"b","status":"connected","source":""}]"#,
        );
    assert_eq!(
        vec!["project", ""],
        state
            .listed()
            .iter()
            .map(|it| it.source.clone())
            .collect::<Vec<_>>()
    );
}

#[test]
fn a_server_is_built_in_when_the_cli_says_sdk_or_when_its_name_is_one_the_session_declared() {
    let declared = Host::default().with(PresenterInput::Launched(Launched {
        effort: None,
        built_in_mcp_servers: vec!["ide-context".into()],
        sandbox: false,
    }));
    let state = declared
        .request("m1", ControlKind::McpStatus, None)
        .answer(
            "m1",
            r#"[{"name":"ide-context","status":"connected"},{"name":"other","status":"connected","source":"sdk"},
            {"name":"user-one","status":"connected","source":"user"}]"#,
        );
    assert_eq!(
        vec![Some(true), Some(true), Some(false)],
        state
            .servers()
            .iter()
            .map(|it| it.get("builtIn").and_then(Value::as_bool))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        vec!["ide-context".to_owned()],
        state.ops().built_in_mcp_servers.to_vec()
    );
    let declared_servers = state.ops().built_in_mcp_servers.clone();
    assert!(
        state.listed()[0].is_built_in(&declared_servers),
        "a declared name"
    );
    assert!(state.listed()[1].is_built_in(&[]), "the CLI says sdk");
    assert!(!state.listed()[2].is_built_in(&declared_servers));
    assert_eq!(
        None,
        declared.thread().get("effort"),
        "names without an effort say no effort"
    );
}

#[test]
fn an_mcp_switch_is_pending_until_the_cli_answers_and_a_switch_answered_once_is_not_changed_again()
{
    let asked = Host::default().request("a", ControlKind::McpEnable, Some("s"));
    assert_eq!(1, asked.ops().switches.len());
    assert_eq!(SwitchOutcome::Pending, asked.ops().switches[0].outcome);
    let applied = asked.event(lines::control_ok("a", None));
    assert_eq!(SwitchOutcome::Applied, applied.ops().switches[0].outcome);
    let late = applied.event(lines::control_error("a", "late"));
    assert_eq!(SwitchOutcome::Applied, late.ops().switches[0].outcome);
    let failed = Host::default()
        .request("b", ControlKind::McpReconnect, Some("s"))
        .with(PresenterInput::ControlSendFailed("b".into()));
    assert_eq!(1, failed.ops().switches.len());
    assert_eq!(SwitchOutcome::Failed, failed.ops().switches[0].outcome);
    let switches = failed
        .thread()
        .get("switches")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("switches"))
        .clone();
    assert_eq!(1, switches.len());
    assert_eq!(Some(&json!("mcp-reconnect")), switches[0].get("kind"));
}
