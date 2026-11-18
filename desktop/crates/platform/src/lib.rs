pub mod theme;

use closta_shell::header::AppHeader;
use gpui_kit::component::ActiveTheme as _;
use gpui_kit::*;

struct Shell {
    header: AppHeader,
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
            .child(self.header.headline.clone())
    }
}

/// Starts the app, opens the window and never returns.
#[allow(clippy::expect_used)]
pub fn run(header: AppHeader) {
    application().with_assets(assets::Assets).run(move |cx| {
        init(cx);
        theme::apply(cx);
        let options = WindowOptions {
            titlebar: Some(TitlebarOptions {
                title: Some(header.title.clone().into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        open_window(options, cx, move |_, cx| cx.new(|_| Shell { header }))
            .expect("failed to open window");
    });
}
