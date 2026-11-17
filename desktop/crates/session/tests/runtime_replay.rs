#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Every capture through the whole runtime: the version check, the launch, the fold and the end.
//! The settings request the host adds is not core's, so the state still matches core's golden.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::sync::{Arc, Mutex, PoisonError};

use closta_model::ConversationState;
use closta_providers::claude::fake::process::ProcessScript;
use closta_providers::claude::fake::spawner::FakeSpawner;
use closta_providers::claude::launch::env::SecretEnv;
use closta_session::launch::NativeSessionLaunchPlanner;
use closta_session::log::SessionLog;
use closta_session::runtime::{SessionConfig, SessionRuntime};
use closta_session::status::SessionStatus;

use support::{GUARD, ID, RecordingLog, VERSION, WORKING_DIR, drive, statuses};

/// Runs `scenario` through a runtime and gives the statuses it went through and the state it
/// ended with.
fn through_runtime(scenario: &str) -> (Vec<SessionStatus>, ConversationState) {
    let lines = common::non_blank_lines(&common::text_of(&format!("{scenario}.ndjson")));
    let spawner = Arc::new(FakeSpawner::new(move |launch| {
        Ok(if launch.args == ["--version"] {
            ProcessScript::replaying(vec![format!("{VERSION} (Claude Code)")])
        } else {
            ProcessScript::replaying(lines.clone())
        })
    }));
    let planner = Arc::new(NativeSessionLaunchPlanner::new(
        spawner,
        Arc::new(SecretEnv::default),
    ));
    let log: Arc<dyn SessionLog> = Arc::new(RecordingLog::default());
    let mut config = SessionConfig::new(ID, planner, Some(WORKING_DIR.to_owned()), log);
    config.version_timeout = GUARD;
    let (runtime, run) = SessionRuntime::new(config);
    let watched = runtime.watch_status();
    drive(|executor| async move { executor.spawn(run).await });
    (statuses(&watched), runtime.view().conversation)
}

#[test]
fn each_capture_through_the_runtime_goes_starting_running_ended_and_matches_the_golden() {
    let scenarios = common::scenario_names();
    assert!(scenarios.len() >= 40, "{} scenarios", scenarios.len());
    let expected = [
        SessionStatus::Starting,
        SessionStatus::Running {
            version: "2.1.282".to_owned(),
        },
        SessionStatus::Ended,
    ];
    let failures = Mutex::new(Vec::new());
    for scenario in &scenarios {
        let fold = |s: &str| {
            let (seen, state) = through_runtime(s);
            if seen != expected {
                failures
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .push(format!("{s}: the statuses were {seen:?}"));
            }
            state
        };
        if let Some(failure) = common::check_scenario(scenario, &fold) {
            failures
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(failure);
        }
    }
    let failures = failures
        .into_inner()
        .unwrap_or_else(PoisonError::into_inner);
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
