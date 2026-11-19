use std::borrow::Cow;

use gpui_kit::App;

/// JetBrains Mono 2.304, Regular, from the official release; licensed under
/// the SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).
const JETBRAINS_MONO_REGULAR: &[u8] = include_bytes!("../assets/fonts/JetBrainsMono-Regular.ttf");

/// Adds the bundled fonts to the text system. Runs before the theme is
/// applied, so the theme's monospace family is found on its first line.
#[allow(clippy::expect_used)]
pub(crate) fn register(cx: &mut App) {
    cx.text_system()
        .add_fonts(vec![Cow::Borrowed(JETBRAINS_MONO_REGULAR)])
        .expect("bundled JetBrains Mono is invalid");
}
