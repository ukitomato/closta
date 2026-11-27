//! Capture 42: `/context` typed as text shows its result in the thread (LocalCommandTextTest.kt,
//! `the result of a typed context command is a text row that starts with its heading`).

use closta_goldens::replay::replay;
use closta_presenter::rows::{ThreadRow, ThreadRows};

#[test]
fn the_result_of_a_typed_context_command_is_a_text_row_that_starts_with_its_heading() {
    let steps = replay("42-local-commands");
    let rows = ThreadRows::default().of(&steps.last().expect("a step").view.transcript);
    assert!(
        rows.iter().any(
            |row| matches!(row, ThreadRow::Text(text) if text.markdown.starts_with("## Context Usage"))
        ),
        "no text row starts with the heading: {} rows",
        rows.len()
    );
}
