//! The performance the rows promise on the largest session the user has had (ThreadRowsBudgetTest.kt):
//! building them all fits in a budget, and while a reply streams in at the end, an update makes new
//! rows only for the last message, so a surface paints only those. The history and the tail are
//! decoded and folded outside the timing: only `ThreadRows::of` is timed.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use closta_goldens::synthetic::{self, LARGEST, replay_script};
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::rows::{ThreadRow, ThreadRows};
use closta_presenter::session::SessionView;
use closta_providers::claude::protocol::decode;

const WARM_UP: usize = 3;
const RUNS: usize = 5;
const BUILD_BUDGET: Duration = Duration::from_millis(300);
const UPDATE_BUDGET: Duration = Duration::from_millis(5);
const P99: usize = 99;
const PERCENT: usize = 100;

/// The largest session, folded. nextest runs each test in a process of its own, so each test
/// builds it once.
fn history() -> SessionView {
    synthetic::steps_with_session_lines(&LARGEST)
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

/// The tail: one reply streamed in, decoded ahead of the timing.
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

fn timed(block: impl FnOnce()) -> Duration {
    let start = Instant::now();
    block();
    start.elapsed()
}

/// The middle value; it assumes an odd number of runs.
fn median(runs: &[Duration]) -> Duration {
    let mut sorted = runs.to_vec();
    sorted.sort();
    sorted[sorted.len() / 2]
}

/// The row's own `Arc`, as an address to look a row up by.
fn address(row: &ThreadRow) -> *const () {
    match row {
        ThreadRow::Ask(it) => Arc::as_ptr(it) as *const (),
        ThreadRow::Text(it) => Arc::as_ptr(it) as *const (),
        ThreadRow::Thinking(it) => Arc::as_ptr(it) as *const (),
        ThreadRow::Tool(it) => Arc::as_ptr(it) as *const (),
        ThreadRow::Explored(it) => Arc::as_ptr(it) as *const (),
        ThreadRow::Todo(it) => Arc::as_ptr(it) as *const (),
        ThreadRow::Card(it) => Arc::as_ptr(it) as *const (),
        ThreadRow::TurnEnd(it) => Arc::as_ptr(it) as *const (),
        ThreadRow::SignIn(it) => Arc::as_ptr(it) as *const (),
        ThreadRow::Divider(it) => Arc::as_ptr(it) as *const (),
        ThreadRow::Notice(it) => Arc::as_ptr(it) as *const (),
    }
}

#[test]
#[ignore = "perf"]
#[allow(clippy::print_stdout)]
fn largest_session_builds_within_budget() {
    let history = history();
    for _ in 0..WARM_UP {
        ThreadRows::default().of(&history.transcript);
    }
    let runs: Vec<Duration> = (0..RUNS)
        .map(|_| {
            timed(|| {
                ThreadRows::default().of(&history.transcript);
            })
        })
        .collect();
    let took = median(&runs);
    println!("perf largest_session_builds median={took:?} runs={runs:?}");
    assert!(
        took <= BUILD_BUDGET,
        "building every row took {took:?} (budget {BUILD_BUDGET:?})"
    );
}

#[test]
fn streaming_tail_rebuilds_only_the_last_message() {
    let mut rows = ThreadRows::default();
    let mut view = sent(history(), "tail");
    let mut before = rows.of(&view.transcript);
    for line in tail() {
        view = view.fold(&line);
        let after = rows.of(&view.transcript);
        let last_key = view
            .transcript
            .messages
            .order()
            .next_back()
            .unwrap_or_else(|| panic!("the conversation has no message"))
            .to_owned();
        // Rows hold their `Arc`s, so an address in `before` is not reused while it is alive.
        let kept: HashSet<*const ()> = before.iter().map(address).collect();
        let remade: Vec<&str> = after
            .iter()
            .filter(|row| !kept.contains(&address(row)))
            .map(ThreadRow::key)
            .collect();
        assert!(
            remade
                .iter()
                .all(|key| key.split('/').next() == Some(last_key.as_str())),
            "an update remade rows outside the last message: {remade:?}"
        );
        before = after;
    }
}

#[test]
#[ignore = "perf"]
#[allow(clippy::print_stdout)]
fn streaming_tail_updates_within_budget() {
    let history = history();
    let tail = tail();
    let mut rows = ThreadRows::default();
    let mut round = |id: &str| -> Duration {
        let mut view = sent(history.clone(), id);
        rows.of(&view.transcript);
        let mut times: Vec<Duration> = tail
            .iter()
            .map(|line| {
                view = std::mem::take(&mut view).fold(line);
                timed(|| {
                    rows.of(&view.transcript);
                })
            })
            .collect();
        times.sort();
        times[times.len() * P99 / PERCENT]
    };
    round("tail_warm_up");
    let runs: Vec<Duration> = (0..RUNS).map(|it| round(&format!("tail{it}"))).collect();
    let p99 = median(&runs);
    println!("perf streaming_tail_update_p99 median={p99:?} runs={runs:?}");
    assert!(
        p99 <= UPDATE_BUDGET,
        "an update took {p99:?} at p99 (budget {UPDATE_BUDGET:?})"
    );
}
