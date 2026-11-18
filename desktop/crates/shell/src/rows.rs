//! How the rows changed from one update to the next, as a list hands them to its surface: one
//! splice where rows came and went, and the rows kept in place whose content changed.

use std::ops::Range;

use closta_presenter::rows::ThreadRow;

/// One change to the rows a surface holds.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum RowChange {
    /// The old rows in `range` gave way to `count` new rows starting at `range.start`.
    Splice { range: Range<usize>, count: usize },
    /// The rows in this range of the new list kept their place but their content changed.
    Remeasure(Range<usize>),
}

/// The changes that turn `before` into `after`: the rows whose keys match from the head and,
/// apart from those, from the tail stay in place; whatever is between is one splice, first. Then
/// the kept rows that are neither the very row nor equal to it, by their index in `after`,
/// neighbours merged, in order. A row made again with the same content (a `SignInRow` is made on
/// every build) is no change.
pub fn row_changes(before: &[ThreadRow], after: &[ThreadRow]) -> Vec<RowChange> {
    let shorter = before.len().min(after.len());
    let head = before
        .iter()
        .zip(after)
        .take_while(|(old, new)| old.key() == new.key())
        .count();
    let tail = before[head..]
        .iter()
        .rev()
        .zip(after[head..].iter().rev())
        .take(shorter - head)
        .take_while(|(old, new)| old.key() == new.key())
        .count();

    let mut changes = Vec::new();
    if head + tail < before.len() || head + tail < after.len() {
        changes.push(RowChange::Splice {
            range: head..before.len() - tail,
            count: after.len() - head - tail,
        });
    }
    let shift = after.len() - tail;
    let kept = (0..head)
        .map(|at| (at, at))
        .chain((0..tail).map(|back| (before.len() - tail + back, shift + back)));
    let mut remeasured: Option<Range<usize>> = None;
    for (old, new) in kept {
        if before[old].same(&after[new]) || before[old] == after[new] {
            continue;
        }
        match &mut remeasured {
            Some(range) if range.end == new => range.end = new + 1,
            _ => {
                changes.extend(remeasured.take().map(RowChange::Remeasure));
                remeasured = Some(new..new + 1);
            }
        }
    }
    changes.extend(remeasured.map(RowChange::Remeasure));
    changes
}

/// How many rows a surface keeps measured above and below what is visible.
pub const KEEP_AROUND: usize = 200;

/// The rows a surface keeps measured when `visible` rows from `top` are on screen.
pub fn kept(top: usize, visible: usize, len: usize) -> Range<usize> {
    top.saturating_sub(KEEP_AROUND)..len.min(top + visible + KEEP_AROUND)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use closta_presenter::rows::{SignInRow, TextRow, ToolRow};
    use closta_presenter::tool_line::{ToolLine, ToolLineState};

    use super::*;

    fn text(key: &str, markdown: &str) -> ThreadRow {
        ThreadRow::Text(Arc::new(TextRow {
            key: key.to_owned(),
            markdown: markdown.to_owned(),
            streaming: false,
            opens: false,
        }))
    }

    fn tool(key: &str, state: ToolLineState) -> ThreadRow {
        ThreadRow::Tool(Arc::new(ToolRow {
            key: key.to_owned(),
            line: ToolLine {
                state,
                label: "Read(a.rs)".to_owned(),
                added: None,
                removed: None,
            },
            tool_use_id: format!("id-{key}"),
            tool_name: "Read".to_owned(),
            depth: 0,
            opens: false,
            detail: None,
            agent: None,
        }))
    }

    fn sign_in(key: &str) -> ThreadRow {
        ThreadRow::SignIn(Arc::new(SignInRow {
            key: key.to_owned(),
        }))
    }

    #[test]
    fn unchanged_rows_give_no_change() {
        let rows = vec![text("a", "hi"), tool("b", ToolLineState::Ok), sign_in("c")];
        assert_eq!(row_changes(&rows, &rows.clone()), []);
        assert_eq!(row_changes(&[], &[]), []);
    }

    #[test]
    fn appended_rows_are_one_splice_at_the_end() {
        let a = text("a", "hi");
        let b = tool("b", ToolLineState::Ok);
        let before = vec![a.clone(), b.clone()];
        let after = vec![a, b, text("c", "more"), sign_in("d")];
        assert_eq!(
            row_changes(&before, &after),
            [RowChange::Splice {
                range: 2..2,
                count: 2
            }]
        );
    }

    #[test]
    fn a_row_made_again_with_the_same_key_and_content_is_no_change() {
        let a = text("a", "hi");
        let before = vec![a.clone(), sign_in("a/sign-in")];
        let after = vec![a, sign_in("a/sign-in")];
        assert!(!before[1].same(&after[1]));
        assert_eq!(row_changes(&before, &after), []);
    }

    #[test]
    fn a_row_that_grew_is_remeasured_where_it_is() {
        let a = text("a", "hi");
        let before = vec![
            a.clone(),
            text("b", "one"),
            tool("c", ToolLineState::Running),
        ];
        let after = vec![a, text("b", "one two"), tool("c", ToolLineState::Ok)];
        assert_eq!(row_changes(&before, &after), [RowChange::Remeasure(1..3)]);
    }

    #[test]
    fn rows_replaced_in_the_middle_are_one_splice_and_remeasures_after_it_use_the_new_indices() {
        let c = text("c", "kept");
        let before = vec![
            text("a", "one"),
            tool("b", ToolLineState::Ok),
            c.clone(),
            tool("d", ToolLineState::Running),
        ];
        let after = vec![
            text("a", "one two"),
            tool("x", ToolLineState::Ok),
            tool("y", ToolLineState::Ok),
            c,
            tool("d", ToolLineState::Ok),
        ];
        assert_eq!(
            row_changes(&before, &after),
            [
                RowChange::Splice {
                    range: 1..2,
                    count: 2
                },
                RowChange::Remeasure(0..1),
                RowChange::Remeasure(4..5),
            ]
        );
    }

    #[test]
    fn rows_taken_away_are_a_splice_of_nothing() {
        let a = text("a", "hi");
        let c = text("c", "bye");
        let before = vec![a.clone(), tool("b", ToolLineState::Ok), c.clone()];
        let after = vec![a, c];
        assert_eq!(
            row_changes(&before, &after),
            [RowChange::Splice {
                range: 1..2,
                count: 0
            }]
        );
    }

    #[test]
    fn a_repeated_key_is_not_counted_twice() {
        let a = text("a", "hi");
        let before = vec![a.clone()];
        let after = vec![a.clone(), a];
        assert_eq!(
            row_changes(&before, &after),
            [RowChange::Splice {
                range: 1..1,
                count: 1
            }]
        );
    }

    #[test]
    fn the_kept_window_is_200_rows_around_what_is_visible() {
        assert_eq!(KEEP_AROUND, 200);
        assert_eq!(kept(0, 30, 1000), 0..230);
        assert_eq!(kept(500, 30, 1000), 300..730);
        assert_eq!(kept(900, 30, 1000), 700..1000);
        assert_eq!(kept(150, 30, 100), 0..100);
    }
}
