//! Permission and question cards, and what answering them sends (ThreadCardsTest.kt).

use std::sync::Arc;

use closta_goldens::common::{non_blank_lines, text_of};
use closta_goldens::replay::replay;
use closta_presenter::cards::decisions::{QuestionPick, question_answers};
use closta_presenter::cards::plan::PlanGo;
use closta_presenter::cards::{
    InputField, PermissionCard, QuestionCard, QuestionOption, SuggestionLine, ThreadCard,
    allow_payload, answer_payload, card_of, passed_on, with_destination,
};
use closta_presenter::json::{JsonFields, TOO_DEEP, compact, parse};
use closta_presenter::rows::{ThreadRow, ThreadRows};
use closta_presenter::tool_line::tool_detail;
use closta_presenter::transcript::{ApprovalRecord, SuggestionRecord, ToolCallRecord};
use serde_json::{Value, json};

fn approvals(scenario: &str) -> Vec<ApprovalRecord> {
    let steps = replay(scenario);
    let transcript = &steps
        .last()
        .unwrap_or_else(|| panic!("{scenario}: no step"))
        .view
        .transcript;
    transcript
        .approvals
        .values()
        .map(|it| ApprovalRecord::clone(it))
        .collect()
}

fn single(scenario: &str) -> ApprovalRecord {
    let all = approvals(scenario);
    assert_eq!(1, all.len(), "{scenario}");
    all.into_iter()
        .next()
        .unwrap_or_else(|| panic!("{scenario}: no approval"))
}

/// What the CLI took as the answered call's input: the capture's AskUserQuestion
/// `tool_use_result`.
fn answered_input(scenario: &str) -> Value {
    non_blank_lines(&text_of(&format!("{scenario}.ndjson")))
        .iter()
        .map(|line| {
            serde_json::from_str::<Value>(line).unwrap_or_else(|e| panic!("{scenario}: {e}"))
        })
        .find_map(|line| {
            line.get("tool_use_result")
                .filter(|it| it.as_object().is_some_and(|o| o.contains_key("answers")))
                .cloned()
        })
        .unwrap_or_else(|| panic!("{scenario}: no answered tool_use_result"))
}

fn permission(card: ThreadCard) -> PermissionCard {
    match card {
        ThreadCard::Permission(card) => card,
        other => panic!("not a permission card: {other:?}"),
    }
}

fn question(card: ThreadCard) -> QuestionCard {
    match card {
        ThreadCard::Question(card) => card,
        other => panic!("not a question card: {other:?}"),
    }
}

fn answers_of(card: &QuestionCard) -> Vec<(String, String)> {
    card.questions
        .iter()
        .map(|it| (it.text.clone(), it.options[0].label.clone()))
        .collect()
}

fn approval_of(tool: &str, input: Value) -> ApprovalRecord {
    ApprovalRecord {
        request_id: "r1".into(),
        tool_use_id: Some("t1".into()),
        tool_name: Some(tool.into()),
        input: Some(Arc::new(input)),
        ..ApprovalRecord::default()
    }
}

fn permission_card(tool: &str, input: Value) -> (PermissionCard, ApprovalRecord) {
    let approval = approval_of(tool, input);
    (permission(card_of(&approval, PlanGo::Auto)), approval)
}

fn field(key: &str, value: &str) -> InputField {
    InputField {
        key: key.into(),
        value: value.into(),
    }
}

#[test]
fn a_write_card_shows_the_file() {
    let approval = approvals("05-permission-can-use-tool").remove(0);
    let path = approval
        .input
        .as_deref()
        .and_then(Value::as_object)
        .and_then(|it| it.string("file_path"))
        .map(str::to_owned);
    let card = permission(card_of(&approval, PlanGo::Auto));
    assert_eq!("Write", card.tool_name);
    assert_eq!(path, card.subject);
}

#[test]
fn a_bash_card_shows_the_command() {
    // No capture asks for Bash (the recorder runs it without asking); the request's shape is the
    // same as Write's.
    let (card, _) = permission_card("Bash", json!({"command": "./gradlew :auth:test"}));
    assert_eq!(Some("./gradlew :auth:test"), card.subject.as_deref());
}

#[test]
fn an_allow_sends_the_requests_own_input() {
    let approval = approvals("05-permission-can-use-tool").remove(0);
    assert_eq!(
        compact(approval.input.as_deref().expect("an input")),
        allow_payload(&approval)
    );
    assert_ne!("{}", allow_payload(&approval));
}

#[test]
fn an_answer_matches_capture_14() {
    let approval = single("14-ask-answers-updatedinput");
    let card = question(card_of(&approval, PlanGo::Auto));
    let sent = answer_payload(&approval, &[(card.questions[0].text.clone(), "A".into())]);
    assert_eq!(
        answered_input("14-ask-answers-updatedinput"),
        serde_json::from_str::<Value>(&sent).expect("JSON")
    );
}

#[test]
fn an_answer_matches_capture_18() {
    let approval = single("18-ask-multi-question");
    let card = question(card_of(&approval, PlanGo::Auto));
    assert_eq!(2, card.questions.len());
    let sent = answer_payload(&approval, &answers_of(&card));
    assert_eq!(
        answered_input("18-ask-multi-question"),
        serde_json::from_str::<Value>(&sent).expect("JSON")
    );
}

#[test]
fn question_options_carry_their_descriptions() {
    let card = question(card_of(&single("18-ask-multi-question"), PlanGo::Auto));
    assert_eq!(
        vec![
            QuestionOption {
                label: "A".into(),
                description: Some("Aを選択します".into())
            },
            QuestionOption {
                label: "B".into(),
                description: Some("Bを選択します".into())
            },
        ],
        card.questions[0].options
    );
    let descriptions: Vec<Option<&str>> = card.questions[1]
        .options
        .iter()
        .map(|it| it.description.as_deref())
        .collect();
    assert_eq!(
        vec![Some("Xを選択します"), Some("Yを選択します")],
        descriptions
    );
}

#[test]
fn a_multi_select_joins_its_labels() {
    let approval = single("14-ask-answers-updatedinput");
    let text = question(card_of(&approval, PlanGo::Auto)).questions[0]
        .text
        .clone();
    let answers = question_answers(&[QuestionPick {
        question: text.clone(),
        chosen: vec!["A".into(), "B".into()],
        other: None,
    }]);
    let sent: Value = serde_json::from_str(&answer_payload(&approval, &answers)).expect("JSON");
    assert_eq!(Some("A, B"), sent["answers"][text.as_str()].as_str());
}

#[test]
fn an_answer_replaces_answers_in_place_and_keeps_a_repeated_questions_first_place() {
    let approval = approval_of(
        "AskUserQuestion",
        json!({"answers": "old", "questions": []}),
    );
    let sent = answer_payload(
        &approval,
        &[
            ("Q".into(), "1".into()),
            ("R".into(), "2".into()),
            ("Q".into(), "3".into()),
        ],
    );
    assert_eq!(r#"{"answers":{"Q":"3","R":"2"},"questions":[]}"#, sent);
}

#[test]
fn accepted_suggestions_are_passed_on_as_the_cli_sent_them() {
    let approval = single("16-permission-suggestion-accept");
    let offered = approval.suggestions.to_vec();
    assert!(!offered.is_empty());
    let passed = passed_on(&approval, &offered);
    let ids: Vec<String> = offered.iter().map(|it| it.id.clone()).collect();
    assert_eq!(ids, passed.accepted_suggestions);
    let raws: Vec<&str> = offered.iter().map(|it| it.raw.as_str()).collect();
    let expected: Value = serde_json::from_str(&format!("[{}]", raws.join(","))).expect("JSON");
    let updated: Value =
        serde_json::from_str(passed.updated_permissions.as_deref().expect("updates"))
            .expect("JSON");
    assert_eq!(expected, updated);
    assert_eq!(
        approval.input.as_deref().and_then(Value::as_object),
        passed.input.as_deref()
    );
    assert_eq!(None, passed_on(&approval, &[]).updated_permissions);
}

#[test]
fn a_suggestion_can_be_kept_elsewhere() {
    let offered = single("16-permission-suggestion-accept").suggestions[0].clone();
    let moved = with_destination(&offered, "userSettings");
    assert_eq!(Some("userSettings"), moved.destination.as_deref());
    let raw: Value = serde_json::from_str(&moved.raw).expect("JSON");
    assert_eq!(Some("userSettings"), raw["destination"].as_str());
    assert_eq!(offered.kind, moved.kind);
}

#[test]
fn a_suggestion_whose_raw_is_not_an_object_stays_as_it_is() {
    let odd = SuggestionRecord {
        id: "s1".into(),
        kind: "addRules".into(),
        raw: "[1]".into(),
        destination: Some("session".into()),
        ..SuggestionRecord::default()
    };
    assert_eq!(odd, with_destination(&odd, "userSettings"));
}

#[test]
fn a_long_command_is_kept_whole() {
    let command = format!("echo {}", "x".repeat(995));
    let (card, _) = permission_card("Bash", json!({"command": command}));
    assert_eq!(1000, command.len());
    assert_eq!(Some(command), card.subject);
    assert_eq!(Vec::<InputField>::new(), card.input_fields);
    assert!(!card.hidden_marked);
}

#[test]
fn a_tool_other_than_bash_and_the_file_tools_shows_every_key() {
    let (card, _) = permission_card(
        "mcp__repo__run",
        json!({"repo": "my-app", "action": "delete"}),
    );
    assert_eq!(
        vec![field("repo", "my-app"), field("action", "delete")],
        card.input_fields
    );
}

#[test]
fn a_value_that_is_not_a_string_is_shown_as_json() {
    let (card, _) = permission_card(
        "mcp__repo__run",
        json!({"force": true, "paths": ["a", "b"]}),
    );
    assert_eq!(
        vec![field("force", "true"), field("paths", r#"["a","b"]"#)],
        card.input_fields
    );
}

#[test]
fn the_file_tools_show_their_path_and_no_fields() {
    let (card, _) = permission_card("Read", json!({"file_path": "/p/a.kt", "offset": "3"}));
    assert_eq!(Some("/p/a.kt"), card.subject.as_deref());
    assert_eq!(Vec::<InputField>::new(), card.input_fields);
}

#[test]
fn an_empty_input_shows_no_fields() {
    let (card, approval) = permission_card("mcp__repo__run", json!({}));
    assert_eq!(Vec::<InputField>::new(), card.input_fields);
    assert_eq!("{}", allow_payload(&approval));
}

#[test]
fn an_allow_without_an_input_sends_an_empty_object() {
    let approval = ApprovalRecord {
        request_id: "r1".into(),
        tool_name: Some("mcp__repo__run".into()),
        ..ApprovalRecord::default()
    };
    assert_eq!("{}", allow_payload(&approval));
    let card = permission(card_of(&approval, PlanGo::Auto));
    assert_eq!(None, card.subject);
    assert_eq!(Vec::<InputField>::new(), card.input_fields);
}

#[test]
fn a_command_with_a_right_to_left_override_is_marked() {
    let (card, _) = permission_card("Bash", json!({"command": "ls \u{202E}txt.exe"}));
    assert_eq!(Some("ls <U+202E>txt.exe"), card.subject.as_deref());
    assert!(card.hidden_marked);
}

#[test]
fn a_suggestion_with_a_hidden_character_is_marked() {
    let dirs = SuggestionRecord {
        id: "s1".into(),
        kind: "addDirectories".into(),
        detail: "/a/evil\u{202E}txt".into(),
        destination: Some("session".into()),
        raw: "{}".into(),
    };
    let approval = ApprovalRecord {
        suggestions: Arc::from(vec![dirs.clone()]),
        ..approval_of("Bash", json!({"command": "ls"}))
    };
    let card = permission(card_of(&approval, PlanGo::Auto));
    assert_eq!(
        vec![SuggestionLine {
            kind: "addDirectories".into(),
            detail: "/a/evil<U+202E>txt".into()
        }],
        card.suggestion_lines
    );
    assert!(card.hidden_marked);
    assert_eq!(&[dirs][..], &card.suggestions[..]);
}

#[test]
fn a_field_with_a_hidden_character_in_its_key_or_value_is_marked() {
    let (by_value, _) = permission_card("mcp__repo__run", json!({"repo": "my\u{200B}app"}));
    assert_eq!(vec![field("repo", "my<U+200B>app")], by_value.input_fields);
    assert!(by_value.hidden_marked);
    let (by_key, _) = permission_card("mcp__repo__run", json!({"re\u{200B}po": "my-app"}));
    assert_eq!(vec![field("re<U+200B>po", "my-app")], by_key.input_fields);
    assert!(by_key.hidden_marked);
}

#[test]
fn a_bash_card_shows_every_key_but_the_command_and_its_description() {
    let (card, _) = permission_card(
        "Bash",
        json!({"command": "ls", "description": "d", "dangerouslyDisableSandbox": true, "timeout": 5}),
    );
    assert_eq!(Some("ls"), card.subject.as_deref());
    assert_eq!(
        vec![
            field("dangerouslyDisableSandbox", "true"),
            field("timeout", "5")
        ],
        card.input_fields
    );
    assert!(card.sandbox_off);
    assert!(!card.subject_in_fields);
}

#[test]
fn a_bash_card_with_the_sandbox_on_does_not_warn() {
    let (card, _) = permission_card(
        "Bash",
        json!({"command": "ls", "dangerouslyDisableSandbox": false}),
    );
    assert!(!card.sandbox_off);
}

#[test]
fn a_notebook_edit_card_shows_its_new_source() {
    let (card, _) = permission_card(
        "NotebookEdit",
        json!({"notebook_path": "/p/n.ipynb", "new_source": "print(1)"}),
    );
    assert_eq!(Some("/p/n.ipynb"), card.subject.as_deref());
    assert_eq!(vec![field("new_source", "print(1)")], card.input_fields);
}

#[test]
fn a_multi_edit_card_shows_its_edits() {
    let (card, _) = permission_card(
        "MultiEdit",
        json!({"file_path": "/p/a.kt", "edits": [{"old_string": "a", "new_string": "b"}]}),
    );
    assert_eq!(
        vec![field("edits", r#"[{"old_string":"a","new_string":"b"}]"#)],
        card.input_fields
    );
}

#[test]
fn edit_and_write_show_their_diff_and_no_fields() {
    let (card, _) = permission_card("Write", json!({"file_path": "/p/a.kt", "content": "x"}));
    assert_eq!(Vec::<InputField>::new(), card.input_fields);
    assert!(card.diff.is_some());
}

#[test]
fn another_tools_subject_is_one_of_its_fields() {
    let (card, _) = permission_card("mcp__repo__run", json!({"repo": "my-app"}));
    assert!(card.subject_in_fields);
}

#[test]
fn a_path_with_a_hidden_character_is_shown_marked_and_opened_as_it_is() {
    let path = "/p/\u{202E}txt.kt";
    let (card, _) = permission_card("Read", json!({"file_path": path}));
    assert_eq!(Some("/p/<U+202E>txt.kt"), card.subject.as_deref());
    assert_eq!(Some(path), card.raw_path.as_deref());
    assert!(card.hidden_marked);
}

#[test]
fn a_command_has_no_path_to_open() {
    let (card, _) = permission_card("Bash", json!({"command": "ls"}));
    assert_eq!(None, card.raw_path);
}

#[test]
fn a_request_held_as_a_question_is_a_question_card_whatever_its_tool() {
    let approval = ApprovalRecord {
        ask: true,
        ..approval_of(
            "mcp__ask__me",
            json!({"questions": [{"question": "Q?", "multiSelect": true}]}),
        )
    };
    let card = question(card_of(&approval, PlanGo::Auto));
    assert_eq!("r1", card.request_id);
    assert!(card.questions[0].multi_select);
    assert_eq!(None, card.questions[0].header);
}

#[test]
fn a_card_of_a_deeply_nested_input_shows_the_cut() {
    let text = format!(
        r#"{{"command":"ls","pad":{}{}}}"#,
        "[".repeat(600),
        "]".repeat(600)
    );
    let input = parse(&text).expect("a value with its deep part cut");
    let approval = approval_of("Bash", input.clone());
    let card = permission(card_of(&approval, PlanGo::Auto));
    assert_eq!(Some("ls"), card.subject.as_deref());
    let pad = card
        .input_fields
        .iter()
        .find(|it| it.key == "pad")
        .expect("the pad field");
    assert!(pad.value.contains(TOO_DEEP));
    // Bash's detail shows only the command, so another tool shows the input as JSON.
    let call = ToolCallRecord {
        tool_use_id: "t1".into(),
        tool_name: "WebFetch".into(),
        input: Some(Arc::new(input)),
        ..ToolCallRecord::default()
    };
    assert!(tool_detail(&call).input.contains(TOO_DEEP));
}

#[test]
fn a_card_reads_an_input_that_is_not_an_object_as_none() {
    let approval = approval_of("mcp__repo__run", Value::Array(vec![json!("x")]));
    let card = permission(card_of(&approval, PlanGo::Auto));
    assert_eq!(None, card.subject);
    assert_eq!(Vec::<InputField>::new(), card.input_fields);
    assert_eq!(None, passed_on(&approval, &[]).input);
    assert_eq!(r#"["x"]"#, allow_payload(&approval));
}

#[test]
fn approval_card_follows_its_anchor_message() {
    let steps = replay("05-permission-can-use-tool");
    let transcript = &steps.last().expect("a step").view.transcript;
    let rows = ThreadRows::default().of(transcript);
    let card = rows
        .iter()
        .position(|it| matches!(it, ThreadRow::Card(_)))
        .expect("a card row");
    assert!(card > 0);
    let anchor = transcript
        .approvals
        .values()
        .next()
        .expect("an approval")
        .anchor
        .clone();
    assert_eq!(anchor.as_deref(), rows[card - 1].key().split('/').next());
}
