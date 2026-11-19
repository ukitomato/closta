//! Making the text of the rows about to come into view before the draw needs it: parsing and
//! laying out Markdown in the draw is what made a frame late while scrolling. Which rows is
//! `closta_shell::rows::prefetch_rows` (with `PREFETCH_AHEAD`, `PREFETCH_BEHIND` and
//! `PREFETCH_QUOTA`); this runs it outside the draw, a quota a frame.

use std::collections::HashMap;

use closta_presenter::rows::ThreadRow;
use closta_shell::rows::{ScrollDirection, prefetch_rows};
use gpui_kit::component::text::TextViewState;
use gpui_kit::*;

/// The lowest a row of the conversation stands: a one-line row. The rows a window can show at
/// most are its height over this.
const ROW_FLOOR: f32 = 20.0;

/// How many rows the window can show at most.
pub(crate) fn visible_rows(window: &Window) -> usize {
    (window.viewport_size().height.as_f32() / ROW_FLOOR).ceil() as usize
}

/// Makes the text states of at most a quota of the rows `prefetch_rows` picks, and returns
/// whether rows remain to be made.
pub(crate) fn make<T: 'static>(
    top: usize,
    visible: usize,
    direction: ScrollDirection,
    rows: &[ThreadRow],
    texts: &mut HashMap<String, Entity<TextViewState>>,
    cx: &mut Context<T>,
) -> bool {
    for at in prefetch_rows(top, visible, direction, rows, |key| texts.contains_key(key)) {
        if let Some(ThreadRow::Text(text)) = rows.get(at) {
            let state = cx.new(|cx| TextViewState::markdown(&text.markdown, cx));
            texts.insert(text.key.clone(), state);
        }
    }
    !prefetch_rows(top, visible, direction, rows, |key| texts.contains_key(key)).is_empty()
}
