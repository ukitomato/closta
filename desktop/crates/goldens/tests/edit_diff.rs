//! The diff a permission card shows for an `Edit` or a `Write`, and the sides the diff viewer
//! shows (EditDiffTest.kt). `anEditCardCarriesItsDiff` moves with the cards.

use std::collections::HashSet;

use closta_goldens::replay::replay;
use closta_presenter::edit_diff::{
    DIFF_MAX_LINES, DiffKind, DiffLine, EditDiff, content_after, diff_sides, edit_diff,
};
use closta_presenter::json::JsonFields;
use closta_presenter::text::kt_lines;
use serde_json::{Value, json};

fn edit(old: &str, new: &str, replace_all: Option<bool>) -> Value {
    let mut members = json!({"file_path": "/w/A.kt", "old_string": old, "new_string": new});
    if let Some(all) = replace_all {
        members["replace_all"] = Value::Bool(all);
    }
    members
}

fn kinds(diff: &EditDiff) -> Vec<DiffKind> {
    diff.lines.iter().map(|it| it.kind).collect()
}

fn line(kind: DiffKind, text: &str) -> DiffLine {
    DiffLine {
        kind,
        text: text.into(),
    }
}

fn count(diff: &EditDiff, kind: DiffKind) -> i32 {
    i32::try_from(diff.lines.iter().filter(|it| it.kind == kind).count()).unwrap_or(i32::MAX)
}

#[test]
fn edit_diff_lines() {
    let steps = replay("17-edit-approval");
    let transcript = &steps.last().unwrap().view.transcript;
    let approvals: Vec<_> = transcript.approvals.values().collect();
    assert_eq!(1, approvals.len());
    let input = approvals[0].input.clone().expect("an input");
    let fields = input.as_object().expect("an object");
    let diff = edit_diff("Edit", Some(&input)).expect("a diff");
    let old: Vec<&str> = kt_lines(fields.string("old_string").unwrap()).collect();
    let new: Vec<&str> = kt_lines(fields.string("new_string").unwrap()).collect();
    let old_set: HashSet<&str> = old.iter().copied().collect();
    let new_set: HashSet<&str> = new.iter().copied().collect();
    let shared = i32::try_from(old_set.intersection(&new_set).count()).unwrap();
    assert_eq!(fields.string("file_path"), Some(diff.file_path.as_str()));
    assert_eq!(i32::try_from(old.len()).unwrap() - shared, diff.removed);
    assert_eq!(i32::try_from(new.len()).unwrap() - shared, diff.added);
    assert_eq!(diff.removed, count(&diff, DiffKind::Removed));
    assert_eq!(diff.added, count(&diff, DiffKind::Added));
    assert!(!diff.replace_all);
    assert!(!diff.cut);
}

#[test]
fn an_edit_keeps_the_lines_it_shares() {
    let diff = edit_diff("Edit", Some(&edit("a\nb\nc\n", "a\nB\nc\nd\n", None))).unwrap();
    assert_eq!(
        vec![
            line(DiffKind::Same, "a"),
            line(DiffKind::Removed, "b"),
            line(DiffKind::Added, "B"),
            line(DiffKind::Same, "c"),
            line(DiffKind::Added, "d"),
        ],
        diff.lines
    );
    assert_eq!(2, diff.added);
    assert_eq!(1, diff.removed);
}

#[test]
fn shared_lines_far_from_a_change_are_left_out() {
    let same = (1..=10)
        .map(|n| format!("s{n}"))
        .collect::<Vec<_>>()
        .join("\n");
    let diff = edit_diff(
        "Edit",
        Some(&edit(
            &format!("{same}\nold"),
            &format!("{same}\nnew"),
            None,
        )),
    )
    .unwrap();
    let kept: Vec<&str> = diff
        .lines
        .iter()
        .filter(|it| it.kind == DiffKind::Same)
        .map(|it| it.text.as_str())
        .collect();
    assert_eq!(vec!["s8", "s9", "s10"], kept);
}

#[test]
fn an_edit_that_changes_nothing_shows_no_lines() {
    let diff = edit_diff("Edit", Some(&edit("a\nb", "a\nb", None))).unwrap();
    assert!(diff.lines.is_empty());
    assert_eq!((0, 0), (diff.added, diff.removed));
    let empty = edit_diff("Edit", Some(&edit("", "", None))).unwrap();
    assert!(empty.lines.is_empty());
}

#[test]
fn write_is_all_added() {
    let input = json!({"file_path": "/w/N.md", "content": "# t\n\nbody\n"});
    let diff = edit_diff("Write", Some(&input)).unwrap();
    assert_eq!(
        vec![DiffKind::Added, DiffKind::Added, DiffKind::Added],
        kinds(&diff)
    );
    assert_eq!(3, diff.added);
    assert_eq!(0, diff.removed);
    assert_eq!("/w/N.md", diff.file_path);
}

#[test]
fn replace_all_is_noted() {
    let noted = |all| {
        edit_diff("Edit", Some(&edit("x", "y", all)))
            .unwrap()
            .replace_all
    };
    assert!(noted(Some(true)));
    assert!(!noted(Some(false)));
    assert!(!noted(None));
}

#[test]
fn huge_write_is_cut() {
    let content = (1..=3_000)
        .map(|n| format!("line {n}"))
        .collect::<Vec<_>>()
        .join("\n");
    let diff = edit_diff(
        "Write",
        Some(&json!({"file_path": "/w/B.txt", "content": content})),
    )
    .unwrap();
    assert_eq!(DIFF_MAX_LINES, diff.lines.len());
    assert!(diff.cut);
    assert_eq!(3_000, diff.added);
}

#[test]
fn a_huge_edit_does_not_compare_every_line() {
    let numbered = |prefix: &str| {
        (1..=3_000)
            .map(|n| format!("{prefix} {n}"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let diff = edit_diff(
        "Edit",
        Some(&edit(&numbered("old"), &numbered("new"), None)),
    )
    .unwrap();
    assert_eq!(3_000, diff.removed);
    assert_eq!(3_000, diff.added);
    assert_eq!(DIFF_MAX_LINES, diff.lines.len());
    assert!(diff.cut);
    assert!(
        diff.lines.iter().all(|it| it.kind == DiffKind::Removed),
        "the removals come first when the middle is too big to compare"
    );
}

#[test]
fn other_tools_have_no_diff() {
    assert_eq!(None, edit_diff("Bash", Some(&json!({"command": "ls"}))));
    assert_eq!(
        None,
        edit_diff("Read", Some(&json!({"file_path": "/w/A.kt"})))
    );
    assert_eq!(
        None,
        edit_diff("MultiEdit", Some(&json!({"file_path": "/w/A.kt"})))
    );
    assert_eq!(
        None,
        edit_diff("Edit", Some(&json!({"file_path": "/w/A.kt"})))
    );
    assert_eq!(None, edit_diff("Write", None));
}

#[test]
fn the_diff_viewer_shows_the_file_after_the_call() {
    assert_eq!(
        Some("a NEW b old".to_owned()),
        content_after("Edit", Some(&edit("old", "NEW", None)), Some("a old b old"))
    );
    assert_eq!(
        Some("a NEW b NEW".to_owned()),
        content_after(
            "Edit",
            Some(&edit("old", "NEW", Some(true))),
            Some("a old b old")
        )
    );
    assert_eq!(
        None,
        content_after("Edit", Some(&edit("absent", "NEW", None)), Some("a old"))
    );
    assert_eq!(
        None,
        content_after("Edit", Some(&edit("", "NEW", None)), Some("a old")),
        "an empty old_string replaces nothing"
    );
    let write = json!({"file_path": "/w/N.md", "content": "all new"});
    assert_eq!(
        Some("all new".to_owned()),
        content_after("Write", Some(&write), None)
    );
    assert_eq!(
        None,
        content_after("Bash", Some(&json!({"command": "ls"})), Some("x"))
    );
}

#[test]
fn an_edit_not_in_the_file_shows_its_own_strings() {
    let sides = |old: &str, new: &str| Some((old.to_owned(), new.to_owned()));
    assert_eq!(
        sides("a old", "a NEW"),
        diff_sides("Edit", Some(&edit("old", "NEW", None)), Some("a old"))
    );
    assert_eq!(
        sides("old", "NEW"),
        diff_sides("Edit", Some(&edit("old", "NEW", None)), Some("gone"))
    );
    assert_eq!(
        sides("", "x"),
        diff_sides(
            "Write",
            Some(&json!({"file_path": "/w/N", "content": "x"})),
            None
        )
    );
    assert_eq!(
        None,
        diff_sides("Bash", Some(&json!({"command": "ls"})), Some("x"))
    );
}

#[test]
fn edit_diff_debug_leaves_out_the_path_and_lines() {
    let diff = edit_diff(
        "Edit",
        Some(&json!({
            "file_path": "/secret/Path.kt",
            "old_string": "password = 1",
            "new_string": "password = 2",
        })),
    )
    .unwrap();
    let shown = format!("{diff:?}");
    assert_eq!("EditDiff(+1 -1, 2 lines, cut=false)", shown);
    assert!(!shown.contains("secret") && !shown.contains("password"));
}
