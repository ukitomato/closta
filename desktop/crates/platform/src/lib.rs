mod fonts;
mod model;
mod shell_view;
pub mod theme;
mod thread;

use std::sync::Arc;

use closta_session::log::TracingLog;
use closta_shell::header::AppHeader;
use closta_shell::panes::{Pane, Panes};
use closta_shell::slot::{SlotLaunch, Spawn};
use closta_shell::state::{ShellAction, ShellState};
use gpui_kit::*;

use crate::model::ShellModel;

/// The window's size when none is asked for.
const WINDOW: (f32, f32) = (1440.0, 900.0);

/// What the app is started with.
pub struct PlatformOptions {
    pub header: AppHeader,
    /// The slots opened at the start, in this order.
    pub slots: Vec<SlotLaunch>,
    /// The window's width and height; 1440×900 when `None`.
    pub window: Option<(f32, f32)>,
    /// Whether the left and the right pane start open; the default panes when `None`.
    pub panes: Option<(bool, bool)>,
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
        } = options;
        let executor = cx.background_executor().clone();
        let spawn: Spawn = Arc::new(move |run| executor.spawn(run).detach());
        let mut shell = ShellState::new(header, spawn, Arc::new(TracingLog));
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
            focus: true,
            show: true,
            ..Default::default()
        };
        open_window(options, cx, move |window, cx| {
            cx.new(|cx| ShellModel::new(shell, slots, window, cx))
        })
        .expect("failed to open window");
    });
}
