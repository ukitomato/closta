//! The whole window for a test: the window's model over a shell whose sessions never run, on a
//! machine that has `claude.exe` and whose folder checks are kept and answered "missing", so no
//! session ever starts.

use std::sync::{Arc, Mutex};

use closta_session::launch::{SessionLaunch, SessionLaunchPlanner};
use closta_session::log::TracingLog;
use closta_session::status::SessionFailure;
use closta_shell::header::AppHeader;
use closta_shell::new_session::{ClaudeOnPath, LaunchChecks, NoSaved, PlannerFor, SavedFor};
use closta_shell::settings::{SavedProject, Settings};
use closta_shell::slot::{SlotLaunch, Spawn};
use closta_shell::state::{Ports, ShellAction, ShellState};
use futures_lite::future;
use gpui_kit::test::TestWindowExt as _;
// Named one by one: the glob would bring in a `test` that hides the built-in attribute.
use gpui_kit::{
    AnyWindowHandle, AppContext as _, Bounds, Entity, FocusHandle, Point, TestAppContext,
    WindowBounds, WindowOptions, open_window, px, size,
};

use crate::model::ShellModel;

/// The folders the shell asked about, in order.
pub(crate) type Asked = Arc<Mutex<Vec<String>>>;

struct Machine {
    asked: Asked,
}

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

    fn folder_exists(&self, folder: &str) -> future::Boxed<bool> {
        if let Ok(mut asked) = self.asked.lock() {
            asked.push(folder.to_owned());
        }
        Box::pin(async { false })
    }
}

struct Never;

impl PlannerFor for Never {
    fn planner(&self, _folder: &str) -> Arc<dyn SessionLaunchPlanner> {
        Arc::new(Never)
    }
}

impl SessionLaunchPlanner for Never {
    fn plan(
        &self,
        _session_id: &str,
        _working_directory: Option<&str>,
    ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
        Box::pin(async { Err(SessionFailure::PlanFailed) })
    }
}

/// Opens the window with `slots` slots, the first selected, and draws it once.
pub(crate) fn open(
    cx: &mut TestAppContext,
    slots: usize,
) -> (AnyWindowHandle, Entity<ShellModel>, Asked) {
    let launches = (0..slots).map(|_| launch(None)).collect();
    open_with(cx, &Settings::default(), launches, false, Arc::new(NoSaved))
}

/// What [`open_tree`] starts with.
pub(crate) struct TreeSetup<'a> {
    /// The projects' folders, in order, each with whether it is collapsed.
    pub(crate) projects: &'a [(&'a str, bool)],
    /// The slots, in order, each with its project's folder or none.
    pub(crate) slots: &'a [Option<&'a str>],
    /// Whether the sessions are run: each then fails to start. Unrun, each stays starting.
    pub(crate) run: bool,
}

/// Opens the window with the projects and the slots, the first selected, and draws it once.
pub(crate) fn open_tree(
    cx: &mut TestAppContext,
    setup: TreeSetup<'_>,
) -> (AnyWindowHandle, Entity<ShellModel>) {
    open_tree_saved(cx, setup, Arc::new(NoSaved))
}

/// [`open_tree`] on a machine whose projects have the saved sessions `saved_for` lists.
pub(crate) fn open_tree_saved(
    cx: &mut TestAppContext,
    setup: TreeSetup<'_>,
    saved_for: Arc<dyn SavedFor>,
) -> (AnyWindowHandle, Entity<ShellModel>) {
    let settings = Settings {
        projects: setup
            .projects
            .iter()
            .map(|(folder, collapsed)| SavedProject {
                folder: (*folder).to_owned(),
                collapsed: *collapsed,
            })
            .collect(),
        ..Settings::default()
    };
    let launches = setup
        .slots
        .iter()
        .map(|folder| launch(folder.map(str::to_owned)))
        .collect();
    let (handle, model, _) = open_with(cx, &settings, launches, setup.run, saved_for);
    (handle, model)
}

/// A launch whose session can never start.
fn launch(project: Option<String>) -> SlotLaunch {
    SlotLaunch {
        title: String::new(),
        planner: Arc::new(Never),
        working_directory: None,
        companion: None,
        relaunch: None,
        project,
        settles_on_failure: false,
        session_id: None,
        resume: None,
    }
}

fn open_with(
    cx: &mut TestAppContext,
    settings: &Settings,
    launches: Vec<SlotLaunch>,
    run: bool,
    saved_for: Arc<dyn SavedFor>,
) -> (AnyWindowHandle, Entity<ShellModel>, Asked) {
    cx.update(gpui_kit::init);
    let asked = Asked::default();
    let ports = Ports {
        checks: Arc::new(Machine {
            asked: Arc::clone(&asked),
        }),
        planner_for: Arc::new(Never),
        settings: Arc::new(closta_shell::settings::MemorySettings),
        saved_for,
    };
    let header = AppHeader {
        title: String::new(),
        headline: String::new(),
    };
    // Unless they are run, the sessions' runs are dropped: none ever runs.
    let spawn: Spawn = if run {
        let executor = cx.executor();
        Arc::new(move |run| executor.spawn(run).detach())
    } else {
        Arc::new(|_| {})
    };
    let mut shell = ShellState::new(header, spawn, Arc::new(TracingLog), ports);
    shell.restore_projects(settings);
    let (handle, model) = cx
        .update(|cx| {
            let bounds = Bounds {
                origin: Point::default(),
                size: size(px(1200.), px(800.)),
            };
            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            };
            open_window(options, cx, move |window, cx| {
                cx.new(|cx| ShellModel::new(shell, launches, None, None, window, cx))
            })
        })
        .expect("open test window");
    draw(cx, handle);
    (handle, model, asked)
}

pub(crate) fn draw(cx: &mut TestAppContext, handle: AnyWindowHandle) {
    cx.update_window(handle, |_, window, cx| window.render_frame(cx))
        .expect("draw");
    cx.run_until_parked();
}

/// Does `action` as a click would, and draws.
pub(crate) fn act(
    cx: &mut TestAppContext,
    handle: AnyWindowHandle,
    model: &Entity<ShellModel>,
    action: ShellAction,
) {
    cx.update_window(handle, |_, window, cx| {
        model.update(cx, |model, cx| model.act(action, window, cx));
    })
    .expect("act");
    draw(cx, handle);
}

pub(crate) fn press(cx: &mut TestAppContext, handle: AnyWindowHandle, key: &str) {
    cx.update_window(handle, |_, window, cx| window.press(key, cx))
        .expect("press a key");
    cx.run_until_parked();
}

pub(crate) fn input(cx: &mut TestAppContext, handle: AnyWindowHandle, text: &str) {
    cx.update_window(handle, |_, window, cx| window.input(text, cx))
        .expect("type");
    cx.run_until_parked();
}

pub(crate) fn focus_on(cx: &mut TestAppContext, handle: AnyWindowHandle, focus: &FocusHandle) {
    cx.update_window(handle, |_, window, cx| {
        window.focus(focus, cx);
        window.render_frame(cx);
    })
    .expect("focus");
    cx.run_until_parked();
}

pub(crate) fn focused(
    cx: &mut TestAppContext,
    handle: AnyWindowHandle,
    focus: &FocusHandle,
) -> bool {
    cx.update_window(handle, |_, window, _| focus.is_focused(window))
        .expect("read the focus")
}
