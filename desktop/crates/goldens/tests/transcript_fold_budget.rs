//! The fold's promise for a long session (TranscriptFoldBudgetTest.kt): a line costs the same at
//! the end of the conversation as at its start, and the largest session the user has had folds
//! within a budget. The lines are decoded first, so only the fold is timed.

use std::time::{Duration, Instant};

use closta_goldens::synthetic::{self, DOUBLED, LARGEST};
use closta_presenter::input::PresenterInput;
use closta_presenter::session::SessionView;

const LONG_SESSION: usize = 5_000;
const WARM_UP: usize = 3;
const RUNS: usize = 5;
const SAMPLE: usize = 1_000;
const SLACK: Duration = Duration::from_millis(20);
const BUDGET: Duration = Duration::from_millis(150);

/// Folds every step and returns the time each one took.
fn timed(steps: &[PresenterInput]) -> Vec<Duration> {
    let mut view = SessionView::default();
    steps
        .iter()
        .map(|step| {
            let start = Instant::now();
            view = std::mem::take(&mut view).fold(step);
            start.elapsed()
        })
        .collect()
}

fn sum(times: &[Duration]) -> Duration {
    times.iter().sum()
}

#[test]
fn fold_time_per_line_stays_flat() {
    // Twice the largest session, as one conversation: the ids are the generator's own, so none
    // repeats.
    let steps = synthetic::steps(&DOUBLED);
    assert!(
        steps.len() > LONG_SESSION,
        "the conversation has {} lines",
        steps.len()
    );
    for _ in 0..WARM_UP {
        timed(&steps);
    }
    let times = timed(&steps);
    let first = sum(&times[..SAMPLE]);
    let last = sum(&times[times.len() - SAMPLE..]);
    assert!(
        last <= first * 2 + SLACK,
        "the last {SAMPLE} lines took {last:?}, the first {SAMPLE} {first:?}"
    );
}

#[test]
#[ignore = "perf"]
#[allow(clippy::print_stdout)]
fn largest_fold_within_budget() {
    let steps = synthetic::steps(&LARGEST);
    for _ in 0..WARM_UP {
        timed(&steps);
    }
    let runs: Vec<Duration> = (0..RUNS).map(|_| sum(&timed(&steps))).collect();
    let mut sorted = runs.clone();
    sorted.sort();
    let took = sorted[RUNS / 2];
    println!("perf largest_fold median={took:?} runs={runs:?}");
    assert!(
        took <= BUDGET,
        "folding {} lines took {took:?} (budget {BUDGET:?})",
        steps.len()
    );
}
