#![allow(clippy::expect_used, clippy::unwrap_used)]
//! What only the state itself can set up: a slot whose session shows its end while its run has
//! not returned.

use std::sync::atomic::{AtomicUsize, Ordering};

use closta_model::AppInfo;
use closta_session::launch::{SessionLaunch, SessionLaunchPlanner};
use closta_session::status::SessionFailure;

use super::*;
use crate::header::app_header;
use crate::new_session::{ClaudeOnPath, NoSaved};
use crate::settings::MemorySettings;

struct Quiet;

impl SessionLog for Quiet {
    fn info(&self, _line: &str) {}

    fn warn(&self, _line: &str) {}
}

struct Machine;

impl LaunchChecks for Machine {
    fn installed_distros(&self) -> Vec<String> {
        Vec::new()
    }
    fn claude_on_path(&self) -> ClaudeOnPath {
        ClaudeOnPath::Found
    }
    fn default_distro(&self) -> Option<String> {
        None
    }
    fn folder_exists(&self, _folder: &str) -> future::Boxed<bool> {
        Box::pin(async { true })
    }
}

struct Idle;

impl SessionLaunchPlanner for Idle {
    fn plan(
        &self,
        _session_id: &str,
        _working_directory: Option<&str>,
    ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
        Box::pin(async { Err(SessionFailure::ScriptOnly) })
    }
}

impl PlannerFor for Idle {
    fn planner(&self, _folder: &str) -> Arc<dyn SessionLaunchPlanner> {
        Arc::new(Idle)
    }
}

/// The runs a spawn was handed, kept unpolled.
type Held = Arc<Mutex<Vec<future::Boxed<()>>>>;

/// A shell whose spawn keeps every run it is handed and never polls one: no run returns.
fn held_shell() -> (ShellState, Held, Arc<AtomicUsize>) {
    let held = Arc::new(Mutex::new(Vec::new()));
    let spawned = Arc::new(AtomicUsize::new(0));
    let (keep, count) = (Arc::clone(&held), Arc::clone(&spawned));
    let spawn: Spawn = Arc::new(move |run| {
        count.fetch_add(1, Ordering::SeqCst);
        keep.lock().unwrap().push(run);
    });
    let header = app_header(&AppInfo {
        name: "Closta".into(),
        version: "0.1.0".into(),
    });
    let ports = Ports {
        checks: Arc::new(Machine),
        planner_for: Arc::new(Idle),
        settings: Arc::new(MemorySettings),
        saved_for: Arc::new(NoSaved),
    };
    (
        ShellState::new(header, spawn, Arc::new(Quiet), ports),
        held,
        spawned,
    )
}

fn launch() -> SlotLaunch {
    SlotLaunch {
        title: "alpha".to_owned(),
        planner: Arc::new(Idle),
        working_directory: Some(r"C:\work\alpha".to_owned()),
        companion: None,
        relaunch: Some(Arc::new(launch)),
        project: Some(r"C:\work\alpha".to_owned()),
        settles_on_failure: false,
        session_id: None,
        resume: None,
    }
}

#[test]
fn restart_does_nothing_while_the_ended_slots_run_has_not_returned() {
    let (mut shell, _held, spawned) = held_shell();
    let slot = shell.open(launch());
    let id = shell.session_id(slot).unwrap();
    // The session showed its end; its run, kept unpolled, has not returned.
    shell.slots.get_mut(&slot).unwrap().status = SessionStatus::Ended;
    assert!(shell.ended(slot));
    assert!(shell.run_alive(&id));
    assert_eq!(spawned.load(Ordering::SeqCst), 1);

    let acted = shell.act(ShellAction::Restart { slot });
    assert!(acted.started.is_none() && acted.rows.is_none());
    assert_eq!(spawned.load(Ordering::SeqCst), 1);
    assert_eq!(shell.live_runs(), 1);
    assert_eq!(shell.session_id(slot).as_deref(), Some(id.as_str()));
    assert!(shell.ended(slot));
}
