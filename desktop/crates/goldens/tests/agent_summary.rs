//! A sub-agent's call as its one-line card shows it (AgentSummaryTest.kt).

use std::sync::Arc;

use closta_goldens::replay::replay;
use closta_model::RawJson;
use closta_presenter::fold::snapshot::{fold_user, tool_result_duration};
use closta_presenter::rows::{ThreadRow, ThreadRows};
use closta_presenter::tool_line::{AgentSummary, agent_summary};
use closta_presenter::transcript::{MessageRecord, PartRecord, ToolCallRecord, ToolResult};
use serde_json::json;

fn calls<'a>(messages: impl Iterator<Item = &'a Arc<MessageRecord>>) -> Vec<&'a ToolCallRecord> {
    messages
        .flat_map(|message| message.parts.values())
        .filter_map(|part| match part.as_ref() {
            PartRecord::ToolCall(call) => Some(call),
            _ => None,
        })
        .flat_map(|call| {
            let mut all = vec![call];
            all.extend(calls(call.messages.values()));
            all
        })
        .collect()
}

#[test]
fn another_tool_has_no_summary() {
    let call = ToolCallRecord {
        tool_use_id: "t1".into(),
        tool_name: "Bash".into(),
        input: Some(Arc::new(json!({"command": "ls"}))),
        ..ToolCallRecord::default()
    };
    assert_eq!(None, agent_summary(&call));
}

#[test]
fn an_agent_without_a_description_still_counts_its_tools() {
    let call = ToolCallRecord {
        tool_use_id: "t1".into(),
        tool_name: "Task".into(),
        ..ToolCallRecord::default()
    };
    assert_eq!(
        Some(AgentSummary {
            description: None,
            tools: 0,
            duration_ms: None,
        }),
        agent_summary(&call)
    );
}

#[test]
fn a_blank_description_is_none_and_nested_calls_are_counted() {
    let transcript = replay("08-subagent-task")
        .last()
        .unwrap()
        .view
        .transcript
        .clone();
    let agent = calls(transcript.messages.values())
        .into_iter()
        .find(|call| call.tool_name == "Agent")
        .expect("the Agent call")
        .clone();
    let blank = ToolCallRecord {
        input: Some(Arc::new(json!({"description": " \u{3000}"}))),
        ..agent
    };
    let summary = agent_summary(&blank).expect("a summary");
    assert_eq!(None, summary.description);
    assert_eq!(1, summary.tools);
}

#[test]
fn the_duration_comes_from_the_agents_result_and_only_from_a_number() {
    let call = ToolCallRecord {
        tool_use_id: "t1".into(),
        tool_name: "Agent".into(),
        result: Some(ToolResult {
            content: None,
            is_error: Some(false),
            duration_ms: Some(1200),
        }),
        ..ToolCallRecord::default()
    };
    assert_eq!(
        Some(1200),
        agent_summary(&call).and_then(|it| it.duration_ms)
    );
    assert_eq!(
        None,
        tool_result_duration(Some(&json!({"totalDurationMs": "soon"})))
    );
    assert_eq!(None, tool_result_duration(Some(&json!("Error: no"))));
    assert_eq!(None, tool_result_duration(None));
}

#[test]
fn only_a_sub_agents_call_takes_a_duration() {
    let transcript = replay("08-subagent-task")
        .last()
        .unwrap()
        .view
        .transcript
        .clone();
    let read = "toolu_017AYaBDFQPgf2trBHtoP1HN";
    let message = RawJson(format!(
        r#"{{"role":"user","content":[{{"type":"tool_result","tool_use_id":"{read}","content":"x"}}]}}"#
    ));
    let late = RawJson(r#"{"totalDurationMs":5}"#.into());
    let folded = fold_user(&transcript, &message, None, "u-late", Some(&late));
    let found: Vec<_> = calls(folded.messages.values())
        .into_iter()
        .filter(|call| call.tool_use_id == read)
        .collect();
    assert_eq!(1, found.len());
    assert_eq!(None, found[0].result.as_ref().and_then(|it| it.duration_ms));
}

#[test]
fn a_sub_agent_row_says_what_it_does_and_how_many_tools_it_called() {
    let steps = replay("08-subagent-task");
    let rows = ThreadRows::default().of(&steps.last().expect("a step").view.transcript);
    let agents: Vec<Option<AgentSummary>> = rows
        .iter()
        .filter_map(|row| match row {
            ThreadRow::Tool(it) if it.tool_name == "Agent" => Some(it.agent.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(
        vec![Some(AgentSummary {
            description: Some("Read NOTES.md and summarize".into()),
            tools: 1,
            duration_ms: Some(3705),
        })],
        agents
    );
}
