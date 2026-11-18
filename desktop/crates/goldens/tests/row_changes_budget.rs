//! The time the row changes take while a reply streams in at the end of the largest session the
//! user has had, the same history and tail as `thread_rows_budget.rs`. The rows are built outside
//! the timing: only `row_changes` is timed.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use closta_goldens::synthetic::{self, LARGEST, replay_script};
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::rows::ThreadRows;
use closta_presenter::session::SessionView;
use closta_providers::claude::protocol::decode;
use closta_shell::rows::row_changes;

const RUNS: usize = 5;
const UPDATE_BUDGET: Duration = Duration::from_millis(1);
const P99: usize = 99;
const PERCENT: usize = 100;

fn history() -> SessionView {
    synthetic::steps(&LARGEST)
        .iter()
        .fold(SessionView::default(), |view, step| view.fold(step))
}

fn sent(view: SessionView, id: &str) -> SessionView {
    view.fold(&PresenterInput::UserSent(UserSent {
        message_id: SendId::new(id).unwrap_or_else(|| panic!("{id} is not a key")),
        text: "続けて".to_owned(),
        attachments: Vec::new(),
        uuid: None,
    }))
}

fn tail() -> Vec<PresenterInput> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../jetbrains/src/testFixtures/resources/bench/replay-reply.md");
    let markdown = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("{} cannot be read: {e}", path.display()));
    replay_script::lines(&markdown, "budget")
        .iter()
        .map(|line| PresenterInput::Event(decode(line)))
        .collect()
}

/// The middle value; it assumes an odd number of runs.
fn median(runs: &[Duration]) -> Duration {
    let mut sorted = runs.to_vec();
    sorted.sort();
    sorted[sorted.len() / 2]
}

#[test]
#[ignore = "perf"]
#[allow(clippy::print_stdout)]
fn streaming_tail_row_changes_within_budget() {
    let history = history();
    let tail = tail();
    let mut rows = ThreadRows::default();
    let mut round = |id: &str| -> Duration {
        let mut view = sent(history.clone(), id);
        let mut before = rows.of(&view.transcript);
        let mut times: Vec<Duration> = tail
            .iter()
            .map(|line| {
                view = std::mem::take(&mut view).fold(line);
                let after = rows.of(&view.transcript);
                let start = Instant::now();
                let changes = row_changes(&before, &after);
                let took = start.elapsed();
                std::hint::black_box(changes);
                before = after;
                took
            })
            .collect();
        times.sort();
        times[times.len() * P99 / PERCENT]
    };
    round("tail_warm_up");
    let runs: Vec<Duration> = (0..RUNS).map(|it| round(&format!("tail{it}"))).collect();
    let p99 = median(&runs);
    println!("perf streaming_tail_row_changes_p99 median={p99:?} runs={runs:?}");
    assert!(
        p99 <= UPDATE_BUDGET,
        "the row changes took {p99:?} at p99 (budget {UPDATE_BUDGET:?})"
    );
}
