pub mod theme;

use closta_presenter::ShellState;
use gpui_kit::component::ActiveTheme as _;
use gpui_kit::*;

struct Shell {
    state: ShellState,
}

impl Render for Shell {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        div()
            .flex()
            .items_center()
            .justify_center()
            .size_full()
            .bg(theme.background)
            .text_color(theme.foreground)
            .child(self.state.headline.clone())
    }
}

/// Starts the app, opens the window and never returns.
#[allow(clippy::expect_used)]
pub fn run(state: ShellState) {
    application().with_assets(assets::Assets).run(move |cx| {
        init(cx);
        theme::apply(cx);
        let options = WindowOptions {
            titlebar: Some(TitlebarOptions {
                title: Some(state.title.clone().into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        open_window(options, cx, move |_, cx| cx.new(|_| Shell { state }))
            .expect("failed to open window");
    });
}
