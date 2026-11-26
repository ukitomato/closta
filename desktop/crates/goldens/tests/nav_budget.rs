//! The time to rebuild the left pane (display names, needs-you rows, tree, cursor items) for fifty
//! projects and eight waiting slots: each slot holds the first wait of a recorded scenario, two
//! slots to a scenario.

use std::time::{Duration, Instant};

use closta_goldens::replay::replay;
use closta_presenter::session::SessionView;
use closta_presenter::sessions::groups::waiting_alerts;
use closta_shell::nav::{nav_items, tree_of};
use closta_shell::needs_you::{SlotNeeds, needs_you_rows};
use closta_shell::projects::{Project, ProjectKey, display_names};
use closta_shell::slot::SlotId;

const RUNS: usize = 1000;
const WARMUP: usize = 10;
const PROJECTS: usize = 50;
const PAIRS: usize = 10;
// About 8x the median; p99 spiked to about 36us under load, and a flaky gate would block
// every later run, while this still catches a quadratic rebuild over fifty projects.
const BUDGET: Duration = Duration::from_micros(100);
// The projects that hold the slots, two each.
const OWNERS: [usize; 4] = [0, 1, 5, 20];
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

fn needs_of(n: usize, view: &SessionView, project: &str) -> SlotNeeds {
    let waits = waiting_alerts(&view.conversation, &view.transcript)
        .into_iter()
        .map(|alert| (alert, 1_000 + n as i64))
        .collect();
    SlotNeeds {
        slot: SlotId::numbered(n as u64 + 1),
        project: Some(project.to_owned()),
        title: format!("session {n}"),
        waits,
        failed: None,
    }
}

/// Fifty projects: ten pairs share a name (one Windows, one WSL), the rest are told apart by
/// their names, with Windows and WSL folders mixed.
fn projects() -> Vec<Project> {
    let mut all = Vec::new();
    for n in 0..PAIRS {
        all.push(format!("C:\\Work\\team{n}\\app{n}"));
        all.push(format!("\\\\wsl.localhost\\Ubuntu\\home\\x\\app{n}"));
    }
    for n in 0..PROJECTS - 2 * PAIRS {
        if n % 2 == 0 {
            all.push(format!("D:\\Code\\solo{n}"));
        } else {
            all.push(format!("\\\\wsl.localhost\\Debian\\srv\\solo{n}"));
        }
    }
    all.iter()
        .filter_map(|folder| Project::new(folder))
        .collect()
}

/// One rebuild, through the functions the shell calls; the glue mirrors `ShellState::tree_rows`
/// and `nav_rows` in crates/shell/src/state/nav.rs.
fn rebuild(
    projects: &[Project],
    slots: &[(SlotId, Option<ProjectKey>)],
    needs: &[SlotNeeds],
) -> usize {
    let names = display_names(projects);
    let rows = needs_you_rows(needs);
    let owners: Vec<(ProjectKey, bool)> = projects
        .iter()
        .map(|it| (it.key.clone(), it.collapsed))
        .collect();
    let tree = tree_of(&owners, slots);
    let waiting: Vec<SlotId> = rows.iter().map(|row| row.slot).collect();
    let items = nav_items(&waiting, &tree);
    std::hint::black_box((&names, &items));
    names.len() + items.len()
}

#[test]
#[ignore = "perf"]
#[allow(clippy::print_stdout)]
fn left_pane_rebuild_within_budget() {
    let mut all = projects();
    assert_eq!(all.len(), PROJECTS);
    // Four projects hold two slots each; one of them is collapsed.
    all[1].collapsed = true;
    let owners: Vec<ProjectKey> = OWNERS.iter().map(|n| all[*n].key.clone()).collect();
    let names = display_names(&all);
    let views: Vec<SessionView> = SCENARIOS
        .iter()
        .flat_map(|it| {
            let view = first_wait(it);
            [view.clone(), view]
        })
        .collect();
    let needs: Vec<SlotNeeds> = views
        .iter()
        .enumerate()
        .map(|(n, v)| needs_of(n, v, &names[OWNERS[n / 2]]))
        .collect();
    let slots: Vec<(SlotId, Option<ProjectKey>)> = needs
        .iter()
        .enumerate()
        .map(|(n, it)| (it.slot, Some(owners[n / 2].clone())))
        .collect();
    assert_eq!(needs_you_rows(&needs).len(), 8, "every slot must wait");
    // The names, then 8 waiting rows, 50 headings and the 6 slots of the open projects.
    assert_eq!(rebuild(&all, &slots, &needs), PROJECTS + (8 + PROJECTS + 6));
    for _ in 0..WARMUP {
        std::hint::black_box(rebuild(&all, &slots, &needs));
    }
    let mut times: Vec<Duration> = (0..RUNS)
        .map(|_| {
            let start = Instant::now();
            let n = rebuild(&all, &slots, &needs);
            let took = start.elapsed();
            std::hint::black_box(n);
            took
        })
        .collect();
    times.sort();
    let median = times[times.len() / 2];
    let p99 = times[times.len() * P99 / PERCENT];
    println!("perf left_pane median={median:?} p99={p99:?}");
    assert!(
        p99 <= BUDGET,
        "the rebuild took {p99:?} at p99 (budget {BUDGET:?})"
    );
}
