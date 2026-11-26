mod clock;
mod closing;
mod composer;
mod dialog;
mod focus;
mod fonts;
mod model;
mod needs_you;
pub mod perf;
mod probe;
mod shell_view;
#[cfg(test)]
mod test_window;
pub mod theme;
mod thread;
mod tree;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use closta_session::log::TracingLog;
use closta_shell::header::AppHeader;
use closta_shell::panes::{Pane, Panes};
use closta_shell::settings::Settings;
use closta_shell::slot::{SlotLaunch, Spawn};
use closta_shell::state::{Ports, ShellAction, ShellState};
use futures_lite::future;
use gpui_kit::*;

use crate::model::ShellModel;
pub use crate::probe::{Probe, write_whole};

/// The window's size when none is asked for.
const WINDOW: (f32, f32) = (1600.0, 1000.0);
/// The smallest the window can be made.
const MIN_WINDOW: (f32, f32) = (1024.0, 700.0);

/// What the app is started with.
pub struct PlatformOptions {
    pub header: AppHeader,
    /// The slots opened at the start, in this order.
    pub slots: Vec<SlotLaunch>,
    /// The window's width and height; 1600×1000 when `None`.
    pub window: Option<(f32, f32)>,
    /// Whether the left and the right pane start open; the default panes when `None`.
    pub panes: Option<(bool, bool)>,
    /// What the run measures and when it quits by itself; `None` for an ordinary run.
    pub measure: Option<Measure>,
    /// What a check's run writes and when it closes by itself; `None` for an ordinary run.
    pub probe: Option<Probe>,
    /// What the shell asks of this machine: the New Session dialog's checks, the planner a
    /// folder starts with and where the projects are kept.
    pub ports: Ports,
    /// The projects the left pane starts with, as they were kept.
    pub projects: Settings,
}

/// A measured run. Once `finished` ends (every replay was written), `ready` is logged; once
/// every slot has refreshed after that, `refreshed` and the rows are logged and the ready file
/// is written. With `exit_after`, the CPU time from its 2nd second to its end is logged, then
/// the conversation is scrolled from its tail to its head (`scroll_through`) and the app quits.
/// A run that never refreshes logs `timeout` and quits 180 s after `started`.
pub struct Measure {
    /// When the exe started: every logged time is from it.
    pub started: Instant,
    /// The CSV of times and counts.
    pub perf_log: Option<PathBuf>,
    /// The empty file written once every slot refreshed after the replays ended.
    pub ready_file: Option<PathBuf>,
    /// Ends once every replay was written; `None` when there is nothing to wait for.
    pub finished: Option<future::Boxed<()>>,
    /// How long after the refresh the app quits.
    pub exit_after: Option<Duration>,
    /// Whether the selected conversation is scrolled from its tail to its head before quitting.
    pub scroll_through: bool,
}

/// Starts the app, opens the window and returns once the window is closed.
#[allow(clippy::expect_used)]
pub fn run(options: PlatformOptions) {
    application().with_assets(assets::Assets).run(move |cx| {
        init(cx);
        fonts::register(cx);
        theme::apply(cx);
        cx.on_window_closed(|cx, _| cx.quit()).detach();

        let PlatformOptions {
            header,
            slots,
            window,
            panes,
            measure,
            probe,
            ports,
            projects,
        } = options;
        let executor = cx.background_executor().clone();
        let spawn: Spawn = Arc::new(move |run| executor.spawn(run).detach());
        let mut shell = ShellState::new(header, spawn, Arc::new(TracingLog), ports);
        shell.restore_projects(&projects);
        if let Some((left, right)) = panes {
            let default = Panes::default();
            for (pane, open, was) in [
                (Pane::Left, left, default.left_open),
                (Pane::Right, right, default.right_open),
            ] {
                if open != was {
                    shell.act(ShellAction::TogglePane(pane));
                }
            }
        }

        let (width, height) = window.unwrap_or(WINDOW);
        let options = WindowOptions {
            titlebar: Some(TitlebarOptions {
                title: Some(shell.header().title.clone().into()),
                ..Default::default()
            }),
            window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                None,
                size(px(width), px(height)),
                cx,
            ))),
            window_min_size: Some(size(px(MIN_WINDOW.0), px(MIN_WINDOW.1))),
            focus: true,
            show: true,
            ..Default::default()
        };
        open_window(options, cx, move |window, cx| {
            cx.new(|cx| ShellModel::new(shell, slots, measure, probe, window, cx))
        })
        .expect("failed to open window");
    });
}
