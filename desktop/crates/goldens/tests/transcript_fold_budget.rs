//! The fold's promise for a long session (TranscriptFoldBudgetTest.kt): a line costs the same at
//! the end of the conversation as at its start, and the largest session the user has had folds
//! within a budget. The lines are decoded first, so only the fold is timed.

use std::time::{Duration, Instant};

use closta_goldens::synthetic::{self, DOUBLED, LARGEST, Shape};
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::session::SessionView;
use closta_providers::claude::protocol::decode;

const LONG_SESSION: usize = 5_000;
const WARM_UP: usize = 3;
const RUNS: usize = 5;
const SAMPLE: usize = 1_000;
const SLACK: Duration = Duration::from_millis(20);
const BUDGET: Duration = Duration::from_millis(150);

/// Each turn sends its prompt, then folds its lines, decoded ahead of the timing.
fn steps(shape: &Shape) -> Vec<PresenterInput> {
    synthetic::session(shape, 1)
        .into_iter()
        .enumerate()
        .flat_map(|(index, turn)| {
            let sent = PresenterInput::UserSent(UserSent {
                message_id: SendId::new(&format!("u{index}"))
                    .unwrap_or_else(|| panic!("u{index} is not a key")),
                text: turn.prompt,
                attachments: Vec::new(),
                uuid: None,
            });
            std::iter::once(sent).chain(
                turn.lines
                    .iter()
                    .map(|line| PresenterInput::Event(decode(line)))
                    .collect::<Vec<_>>(),
            )
        })
        .collect()
}

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
    let steps = steps(&DOUBLED);
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
    let steps = steps(&LARGEST);
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
