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

/// The rows a surface keeps measured when `visible` rows from `top` are on screen. Empty, never
/// reversed, when `top` is past the end.
pub fn kept(top: usize, visible: usize, len: usize) -> Range<usize> {
    let end = len.min(top + visible + KEEP_AROUND);
    top.saturating_sub(KEEP_AROUND).min(end)..end
}

/// The top row to keep and prefetch around, when the list reports `scroll_top` and whether it
/// is `following_tail`: a list that follows its tail shows its last `visible` rows, though it
/// reports row 0 until it is first laid out with rows.
pub fn list_top(scroll_top: usize, following_tail: bool, visible: usize, len: usize) -> usize {
    if following_tail {
        len.saturating_sub(visible)
    } else {
        scroll_top
    }
}

/// How many rows past what is visible, in the direction of the scroll, get their text made
/// before they come into view.
pub const PREFETCH_AHEAD: usize = 40;
/// How many rows on the other side of what is visible get their text made.
pub const PREFETCH_BEHIND: usize = 40;
/// How many rows get their text made in one frame at most.
pub const PREFETCH_QUOTA: usize = 8;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ScrollDirection {
    Up,
    Down,
}

/// The text rows whose text to make next, at most [`PREFETCH_QUOTA`] of them, when `visible`
/// rows from `top` are on screen and the list last moved in `direction`: first the visible rows
/// and the [`PREFETCH_AHEAD`] rows past them in that direction, nearest first in the direction
/// of travel; then the [`PREFETCH_BEHIND`] rows on the other side, nearest first. Rows `cached`
/// by key are skipped.
pub fn prefetch_rows(
    top: usize,
    visible: usize,
    direction: ScrollDirection,
    rows: &[ThreadRow],
    cached: impl Fn(&str) -> bool,
) -> Vec<usize> {
    let len = rows.len();
    let bottom = top.saturating_add(visible);
    let clip = |range: Range<usize>| range.start.min(len)..range.end.min(len);
    let (ahead, behind): (
        Box<dyn Iterator<Item = usize>>,
        Box<dyn Iterator<Item = usize>>,
    ) = match direction {
        ScrollDirection::Down => (
            Box::new(clip(top..bottom.saturating_add(PREFETCH_AHEAD))),
            Box::new(clip(top.saturating_sub(PREFETCH_BEHIND)..top).rev()),
        ),
        ScrollDirection::Up => (
            Box::new(clip(top.saturating_sub(PREFETCH_AHEAD)..bottom).rev()),
            Box::new(clip(bottom..bottom.saturating_add(PREFETCH_BEHIND))),
        ),
    };
    ahead
        .chain(behind)
        .filter(|&at| matches!(&rows[at], ThreadRow::Text(row) if !cached(&row.key)))
        .take(PREFETCH_QUOTA)
        .collect()
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
        assert_eq!(kept(500, 30, 100), 100..100);
    }

    fn texts(len: usize) -> Vec<ThreadRow> {
        (0..len).map(|at| text(&format!("t{at}"), "body")).collect()
    }

    fn at(key: &str) -> usize {
        key[1..].parse().unwrap_or(usize::MAX)
    }

    #[test]
    fn prefetch_takes_text_rows_ahead_first_up_to_the_quota() {
        assert_eq!(
            (PREFETCH_AHEAD, PREFETCH_BEHIND, PREFETCH_QUOTA),
            (40, 40, 8)
        );
        let rows = texts(300);
        let nothing = |_: &str| false;
        // Scrolling down: the visible rows, then the rows below them, nearest first.
        assert_eq!(
            prefetch_rows(100, 5, ScrollDirection::Down, &rows, nothing),
            [100, 101, 102, 103, 104, 105, 106, 107]
        );
        // Scrolling up: from the bottom of what is visible upwards.
        assert_eq!(
            prefetch_rows(100, 5, ScrollDirection::Up, &rows, nothing),
            [104, 103, 102, 101, 100, 99, 98, 97]
        );
        // With the visible rows and the rows ahead made, the rows behind come next.
        let ahead_made = |key: &str| (100..145).contains(&at(key));
        assert_eq!(
            prefetch_rows(100, 5, ScrollDirection::Down, &rows, ahead_made),
            [99, 98, 97, 96, 95, 94, 93, 92]
        );
        // Nothing beyond 40 rows ahead and 40 behind.
        let all_but_far = |key: &str| (60..145).contains(&at(key));
        assert_eq!(
            prefetch_rows(100, 5, ScrollDirection::Down, &rows, all_but_far),
            Vec::<usize>::new()
        );
    }

    #[test]
    fn prefetch_skips_cached_and_non_text_rows() {
        let rows = vec![
            text("a", "one"),
            tool("b", ToolLineState::Ok),
            text("c", "two"),
            sign_in("d"),
            text("e", "three"),
            text("f", "four"),
        ];
        assert_eq!(
            prefetch_rows(0, 2, ScrollDirection::Down, &rows, |key: &str| key == "c"),
            [0, 4, 5]
        );
        assert_eq!(
            prefetch_rows(0, 6, ScrollDirection::Down, &rows, |_: &str| true),
            Vec::<usize>::new()
        );
    }

    #[test]
    fn prefetch_stays_inside_the_list() {
        let rows = texts(10);
        let nothing = |_: &str| false;
        assert_eq!(
            prefetch_rows(8, 30, ScrollDirection::Down, &rows, nothing),
            [8, 9, 7, 6, 5, 4, 3, 2]
        );
        assert_eq!(
            prefetch_rows(0, 3, ScrollDirection::Up, &rows, nothing),
            [2, 1, 0, 3, 4, 5, 6, 7]
        );
        // A top past the end (the list shrank under it) and an empty list.
        assert_eq!(
            prefetch_rows(25, 5, ScrollDirection::Down, &rows, nothing),
            [9, 8, 7, 6, 5, 4, 3, 2]
        );
        assert_eq!(
            prefetch_rows(0, 5, ScrollDirection::Up, &[], nothing),
            Vec::<usize>::new()
        );
    }

    #[test]
    fn a_list_following_its_tail_counts_from_the_tail() {
        // Before its first layout a list that follows its tail still reports row 0 on top.
        assert_eq!(list_top(0, true, 45, 1000), 955);
        assert_eq!(list_top(1000, true, 45, 1000), 955);
        assert_eq!(list_top(0, true, 45, 10), 0);
        // Scrolled away from the tail, the top is where the list stands.
        assert_eq!(list_top(300, false, 45, 1000), 300);
        // So the first prefetch of a big conversation takes the rows at its end.
        let rows = texts(1000);
        let top = list_top(0, true, 45, rows.len());
        assert!(
            prefetch_rows(top, 45, ScrollDirection::Up, &rows, |_: &str| false)
                .iter()
                .all(|at| *at >= 955)
        );
    }
}
