//! The whole window for a test: the window's model over a shell whose sessions never run, on a
//! machine that has `claude.exe` and whose folder checks are kept and answered "missing", so no
//! session ever starts.

use std::sync::{Arc, Mutex};

use closta_session::launch::{SessionLaunch, SessionLaunchPlanner};
use closta_session::log::TracingLog;
use closta_session::status::SessionFailure;
use closta_shell::header::AppHeader;
use closta_shell::new_session::{ClaudeOnPath, LaunchChecks, PlannerFor};
use closta_shell::slot::SlotLaunch;
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
    cx.update(gpui_kit::init);
    let asked = Asked::default();
    let ports = Ports {
        checks: Arc::new(Machine {
            asked: Arc::clone(&asked),
        }),
        planner_for: Arc::new(Never),
    };
    let header = AppHeader {
        title: String::new(),
        headline: String::new(),
    };
    // The sessions' runs are dropped: none ever runs.
    let shell = ShellState::new(header, Arc::new(|_| {}), Arc::new(TracingLog), ports);
    let launches: Vec<SlotLaunch> = (0..slots)
        .map(|_| SlotLaunch {
            title: String::new(),
            planner: Arc::new(Never),
            working_directory: None,
            companion: None,
            relaunch: None,
            settles_on_failure: false,
        })
        .collect();
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
