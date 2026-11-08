use gpui_kit::App;
use gpui_kit::component::{Theme, ThemeMode, ThemeRegistry};

pub const THEME_NAME: &str = "Closta New UI Dark";

const THEME_JSON: &str = include_str!("../themes/new-ui-dark.json");

/// Loads the bundled theme, applies it and switches to dark mode.
#[allow(clippy::expect_used)]
pub(crate) fn apply(cx: &mut App) {
    ThemeRegistry::global_mut(cx)
        .load_themes_from_str(THEME_JSON)
        .expect("bundled theme json is invalid");
    let config = ThemeRegistry::global(cx)
        .themes()
        .get(THEME_NAME)
        .cloned()
        .expect("theme Closta New UI Dark is missing");
    Theme::global_mut(cx).apply_config(&config);
    Theme::change(ThemeMode::Dark, None, cx);
}
