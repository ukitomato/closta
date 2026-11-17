#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Every capture through `ClaudeSession`'s real read path (process, pump, decoder, events), in
//! memory. Mirrors ClaudeSessionGoldenTest.kt, and also compares the events one by one with the
//! direct decode.

mod common;

use std::time::Duration;

use closta_core::fold;
use closta_model::{AgentEvent, ConversationState};
use closta_providers::claude::fake::process::{FakeProcess, ProcessScript};
use closta_providers::claude::session::{ClaudeSession, PumpEnd};
use common::*;
use futures_lite::{StreamExt, future};

const SESSION_ID: &str = "test-session";
const TIMEOUT: Duration = Duration::from_secs(30);

/// The events of `scenario` as the session hands them out, and how the pump ended.
fn through_session(scenario: &str) -> (Vec<AgentEvent>, PumpEnd) {
    let lines = non_blank_lines(&text_of(&format!("{scenario}.ndjson")));
    let (process, _probe) = FakeProcess::new(ProcessScript::replaying(lines));
    let started = ClaudeSession::start(Box::new(process), SESSION_ID);
    let run = future::zip(started.pump, started.events.collect::<Vec<_>>());
    // A straight replay always ends; the timer only turns a pump defect into a failure.
    let (end, events) = smol::block_on(future::or(run, async {
        smol::Timer::after(TIMEOUT).await;
        panic!("{scenario}: the replay did not end within {TIMEOUT:?}")
    }));
    (events, end)
}

#[test]
fn each_capture_through_claude_session_gives_the_decoded_events_and_the_golden() {
    let scenarios = scenario_names();
    assert!(!scenarios.is_empty(), "the manifest lists no scenarios");
    let mut failures = Vec::new();
    for scenario in &scenarios {
        let (events, end) = through_session(scenario);
        if end != PumpEnd::Ended {
            failures.push(format!("{scenario}: the pump ended as {end:?}"));
        }
        let direct = parse_all(&text_of(&format!("{scenario}.ndjson")));
        if events.len() != direct.len() {
            failures.push(format!(
                "{scenario}: {} events through the session, {} decoded directly",
                events.len(),
                direct.len()
            ));
        } else if let Some(i) = (0..events.len()).find(|&i| events[i] != direct[i]) {
            failures.push(format!(
                "{scenario}: event {} differs from the direct decode",
                i + 1
            ));
        }
        let fold_through_session = |s: &str| {
            through_session(s)
                .0
                .iter()
                .fold(ConversationState::default(), fold)
        };
        if let Some(failure) = check_scenario(scenario, &fold_through_session) {
            failures.push(failure);
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
