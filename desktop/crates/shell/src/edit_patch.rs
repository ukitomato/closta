//! An edit as a unified patch, for the diff view a permission card shows.

use closta_presenter::edit_diff::{DiffKind, EditDiff};

/// The patch of `diff`, one hunk named by the file; `None` when no line is left to show.
pub fn edit_patch(diff: &EditDiff) -> Option<String> {
    if diff.lines.is_empty() {
        return None;
    }
    let count = |keep: fn(DiffKind) -> bool| diff.lines.iter().filter(|it| keep(it.kind)).count();
    let before = count(|kind| kind != DiffKind::Added);
    let after = count(|kind| kind != DiffKind::Removed);
    let name = diff
        .file_path
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default();
    let mut patch = format!(
        "--- a/{name}\n+++ b/{name}\n@@ -{} +{} @@\n",
        range(before),
        range(after)
    );
    for line in &diff.lines {
        patch.push(match line.kind {
            DiffKind::Same => ' ',
            DiffKind::Added => '+',
            DiffKind::Removed => '-',
        });
        patch.push_str(line.text.strip_suffix('\r').unwrap_or(&line.text));
        patch.push('\n');
    }
    Some(patch)
}

/// A hunk side's range: it starts at line 1, or at 0 when it has no line.
fn range(count: usize) -> String {
    if count == 0 {
        "0,0".to_owned()
    } else {
        format!("1,{count}")
    }
}

#[cfg(test)]
mod tests {
    use closta_presenter::edit_diff::{DiffKind, DiffLine};

    use super::*;

    fn diff(path: &str, lines: &[(DiffKind, &str)]) -> EditDiff {
        EditDiff {
            file_path: path.to_owned(),
            lines: lines
                .iter()
                .map(|(kind, text)| DiffLine {
                    kind: *kind,
                    text: (*text).to_owned(),
                })
                .collect(),
            added: 0,
            removed: 0,
            replace_all: false,
            cut: false,
        }
    }

    #[test]
    fn an_edit_becomes_one_hunk_named_by_the_file() {
        let patch = edit_patch(&diff(
            "/home/u/x/auth.rs",
            &[
                (DiffKind::Same, "a"),
                (DiffKind::Removed, "b"),
                (DiffKind::Added, "c"),
            ],
        ))
        .unwrap();
        assert_eq!(
            patch,
            "--- a/auth.rs\n+++ b/auth.rs\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n"
        );
        assert!(!patch.contains("home"));
    }

    #[test]
    fn a_write_adds_every_line() {
        let patch = edit_patch(&diff(
            "/x/new.rs",
            &[(DiffKind::Added, "a"), (DiffKind::Added, "b")],
        ))
        .unwrap();
        assert!(patch.contains("@@ -0,0 +1,2 @@\n"), "{patch}");
    }

    #[test]
    fn a_windows_path_is_named_by_its_last_part() {
        let patch = edit_patch(&diff("C:\\x\\auth.rs", &[(DiffKind::Same, "a")])).unwrap();
        assert!(
            patch.starts_with("--- a/auth.rs\n+++ b/auth.rs\n"),
            "{patch}"
        );
    }

    #[test]
    fn a_carriage_return_at_the_end_of_a_line_is_dropped() {
        let patch = edit_patch(&diff(
            "/x/a.rs",
            &[(DiffKind::Same, "a\r"), (DiffKind::Added, "b\r")],
        ))
        .unwrap();
        assert!(patch.ends_with(" a\n+b\n"), "{patch:?}");
    }

    #[test]
    fn an_empty_diff_has_no_patch() {
        assert_eq!(edit_patch(&diff("/x/a.rs", &[])), None);
    }
}
