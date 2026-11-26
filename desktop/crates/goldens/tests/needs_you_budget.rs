//! The time to gather what 8 slots wait for into the needs-you rows when one slot's view
//! changes: each slot holds the first wait of a recorded scenario, two slots to a scenario.

use std::time::{Duration, Instant};

use closta_goldens::replay::replay;
use closta_presenter::session::SessionView;
use closta_presenter::sessions::groups::waiting_alerts;
use closta_shell::needs_you::{SlotNeeds, needs_you_rows};
use closta_shell::slot::SlotId;

const RUNS: usize = 1000;
const BUDGET: Duration = Duration::from_millis(1);
const P99: usize = 99;
const PERCENT: usize = 100;
const SCENARIOS: [&str; 4] = [
    "36-sandbox-unavailable",
    "17-edit-approval",
    "18-ask-multi-question",
    "29-exit-plan-mode",
];

/// The view at the first step where an approval waits.
fn first_wait(scenario: &str) -> SessionView {
    replay(scenario)
        .into_iter()
        .map(|step| step.view)
        .find(|view| {
            view.conversation
                .pending_approvals
                .iter()
                .any(|it| !it.request_id.is_empty())
        })
        .unwrap_or_else(|| panic!("{scenario}: nothing waits"))
}

fn needs_of(n: usize, view: &SessionView) -> SlotNeeds {
    let waits = waiting_alerts(&view.conversation, &view.transcript)
        .into_iter()
        .map(|alert| (alert, 1_000 + n as i64))
        .collect();
    SlotNeeds {
        slot: SlotId::numbered(n as u64 + 1),
        project: None,
        title: format!("session {n}"),
        waits,
        failed: None,
    }
}

#[test]
#[ignore = "perf"]
#[allow(clippy::print_stdout)]
fn needs_you_refresh_within_budget() {
    let views: Vec<SessionView> = SCENARIOS
        .iter()
        .flat_map(|it| {
            let view = first_wait(it);
            [view.clone(), view]
        })
        .collect();
    let mut all: Vec<SlotNeeds> = views
        .iter()
        .enumerate()
        .map(|(n, v)| needs_of(n, v))
        .collect();
    assert_eq!(views.len(), 8);
    assert_eq!(needs_you_rows(&all).len(), 8, "every slot must wait");
    let mut times: Vec<Duration> = (0..RUNS)
        .map(|run| {
            let n = run % views.len();
            let start = Instant::now();
            all[n] = needs_of(n, &views[n]);
            let rows = needs_you_rows(&all);
            let took = start.elapsed();
            std::hint::black_box(rows);
            took
        })
        .collect();
    times.sort();
    let p99 = times[times.len() * P99 / PERCENT];
    println!("perf needs_you_refresh_p99 {p99:?}");
    assert!(
        p99 <= BUDGET,
        "the refresh took {p99:?} at p99 (budget {BUDGET:?})"
    );
}
