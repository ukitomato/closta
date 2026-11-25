//! The budget of resuming the largest session: reading its saved record and putting it back in the
//! two steps a resumed session takes (the newest 400 lines, then every line, each folded onto the
//! view from before), and listing fifty such records. The steps are folded here by the same rule
//! as the session's, which this crate cannot depend on.

use std::sync::Arc;
use std::time::{Duration, Instant};

use closta_core::ports::SavedSessions;
use closta_goldens::synthetic::LARGEST;
use closta_goldens::synthetic::record_script::{SESSION_ID, record_text, transcripts};
use closta_model::AgentEvent;
use closta_presenter::input::PresenterInput;
use closta_presenter::session::SessionView;

const WARM_UP: usize = 3;
const RUNS: usize = 5;
const TAIL_LINES: usize = 400;
const LISTED: usize = 50;
const READ_BUDGET: Duration = Duration::from_millis(230);
const LIST_BUDGET: Duration = Duration::from_millis(90);

fn never() -> bool {
    false
}

fn record() -> Arc<[u8]> {
    record_text(&LARGEST, 1).0.into_bytes().into()
}

fn restored(events: &[AgentEvent], dropped: i32) -> SessionView {
    events
        .iter()
        .fold(SessionView::default(), |view, event| {
            view.fold(&PresenterInput::Restored(event.clone()))
        })
        .fold(&PresenterInput::HistoryRestored(dropped))
}

/// The median of `RUNS` timings of `run`, after `WARM_UP` untimed ones, and every run's time.
fn median(mut run: impl FnMut()) -> (Duration, Vec<Duration>) {
    for _ in 0..WARM_UP {
        run();
    }
    let runs: Vec<Duration> = (0..RUNS)
        .map(|_| {
            let start = Instant::now();
            run();
            start.elapsed()
        })
        .collect();
    let mut sorted = runs.clone();
    sorted.sort();
    (sorted[RUNS / 2], runs)
}

#[test]
#[ignore = "perf"]
#[allow(clippy::print_stdout)]
fn record_read_and_restore_within_budget() {
    let sessions = transcripts(&[(SESSION_ID.to_owned(), record())]);
    let mut lines = 0;
    let (took, runs) = median(|| {
        let read = sessions
            .read(SESSION_ID, &never)
            .unwrap_or_else(|e| panic!("the record could not be read: {e:?}"));
        let events = &read.events;
        assert!(
            events.len() > TAIL_LINES,
            "the record has {} lines",
            events.len()
        );
        let left_out = i32::try_from(events.len() - TAIL_LINES).unwrap_or(i32::MAX);
        let tail = restored(
            &events[events.len() - TAIL_LINES..],
            left_out + read.dropped,
        );
        let all = restored(events, read.dropped);
        std::hint::black_box((tail, all));
        lines = events.len();
    });
    println!("perf record_read median={took:?} runs={runs:?}");
    assert!(
        took <= READ_BUDGET,
        "reading and restoring {lines} lines took {took:?} (budget {READ_BUDGET:?})"
    );
}

#[test]
#[ignore = "perf"]
#[allow(clippy::print_stdout)]
fn saved_list_of_fifty_within_budget() {
    let bytes = record();
    let records: Vec<(String, Arc<[u8]>)> = (0..LISTED)
        .map(|n| {
            (
                format!("5e55a0e0-0000-4000-8000-{n:012x}"),
                Arc::clone(&bytes),
            )
        })
        .collect();
    let sessions = transcripts(&records);
    let (took, runs) = median(|| {
        let listed = sessions
            .list(&never)
            .unwrap_or_else(|e| panic!("the records could not be listed: {e:?}"));
        assert_eq!(listed.len(), LISTED);
    });
    println!("perf saved_list median={took:?} runs={runs:?}");
    assert!(
        took <= LIST_BUDGET,
        "listing {LISTED} records took {took:?} (budget {LIST_BUDGET:?})"
    );
}
