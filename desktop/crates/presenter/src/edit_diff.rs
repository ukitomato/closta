//! The small diff a permission card shows for an `Edit` or a `Write`, and the two sides the diff
//! viewer shows, from EditDiff.kt.

use std::fmt;

use serde_json::{Map, Value};

use crate::json::JsonFields;

/// How a line of an [`EditDiff`] reads: kept, added, or removed.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum DiffKind {
    Same,
    Added,
    Removed,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct DiffLine {
    pub kind: DiffKind,
    pub text: String,
}

/// The small diff a permission card shows for an `Edit` or a `Write`: the lines of the input's
/// strings, not of the file. `added` and `removed` count every line, also the ones `cut` left out
/// of `lines`.
#[derive(Clone, PartialEq, Eq)]
pub struct EditDiff {
    pub file_path: String,
    pub lines: Vec<DiffLine>,
    pub added: i32,
    pub removed: i32,
    pub replace_all: bool,
    pub cut: bool,
}

// The path and the lines are the user's code: never in a log.
impl fmt::Debug for EditDiff {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "EditDiff(+{} -{}, {} lines, cut={})",
            self.added,
            self.removed,
            self.lines.len(),
            self.cut
        )
    }
}

/// The most lines a card shows; the rest is for the diff viewer.
pub const DIFF_MAX_LINES: usize = 2_000;

const CONTEXT: usize = 3;
/// Above this many cells (`a.len() * b.len()`) the middle is not compared line by line.
const LCS_MAX_CELLS: usize = 4_000_000;
const EDIT: &str = "Edit";
const WRITE: &str = "Write";

/// The diff for a call of `tool_name` with `input`; `None` for any other tool, or an input that
/// cannot be read.
pub fn edit_diff(tool_name: &str, input: Option<&Value>) -> Option<EditDiff> {
    let fields = input?.as_object()?;
    let path = fields.string("file_path")?;
    match tool_name {
        EDIT => {
            let old = fields.string("old_string")?;
            let new = fields.string("new_string")?;
            Some(made(
                path,
                compared(&lines_of(old), &lines_of(new)),
                replace_all(fields),
            ))
        }
        WRITE => {
            let content = fields.string("content")?;
            let lines = lines_of(content)
                .into_iter()
                .map(|line| diff_line(DiffKind::Added, line))
                .collect();
            Some(made(path, lines, false))
        }
        _ => None,
    }
}

fn replace_all(fields: &Map<String, Value>) -> bool {
    fields.get("replace_all") == Some(&Value::Bool(true))
}

fn diff_line(kind: DiffKind, text: &str) -> DiffLine {
    DiffLine {
        kind,
        text: text.to_owned(),
    }
}

fn count(lines: &[DiffLine], kind: DiffKind) -> i32 {
    let n = lines.iter().filter(|it| it.kind == kind).count();
    i32::try_from(n).unwrap_or(i32::MAX)
}

fn made(path: &str, all: Vec<DiffLine>, replace_all: bool) -> EditDiff {
    let added = count(&all, DiffKind::Added);
    let removed = count(&all, DiffKind::Removed);
    let mut shown = with_context(all);
    let cut = shown.len() > DIFF_MAX_LINES;
    shown.truncate(DIFF_MAX_LINES);
    EditDiff {
        file_path: path.to_owned(),
        lines: shown,
        added,
        removed,
        replace_all,
        cut,
    }
}

/// The lines of `text`: split at `\n` only, as Kotlin's `split('\n')`; no empty line after a
/// last newline, none at all for "".
fn lines_of(text: &str) -> Vec<&str> {
    if text.is_empty() {
        return Vec::new();
    }
    let mut lines: Vec<&str> = text.split('\n').collect();
    if text.ends_with('\n') {
        lines.pop();
    }
    lines
}

/// `old` to `new` line by line: the common head and tail kept, the middle by LCS when it is
/// small enough.
fn compared(old: &[&str], new: &[&str]) -> Vec<DiffLine> {
    let head = old.iter().zip(new).take_while(|(a, b)| a == b).count();
    let tail = old[head..]
        .iter()
        .rev()
        .zip(new[head..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let a = &old[head..old.len() - tail];
    let b = &new[head..new.len() - tail];
    let mut out = Vec::with_capacity(old.len() + b.len());
    out.extend(old[..head].iter().map(|it| diff_line(DiffKind::Same, it)));
    if a.len().saturating_mul(b.len()) > LCS_MAX_CELLS {
        out.extend(a.iter().map(|it| diff_line(DiffKind::Removed, it)));
        out.extend(b.iter().map(|it| diff_line(DiffKind::Added, it)));
    } else {
        lcs(a, b, &mut out);
    }
    out.extend(
        old[old.len() - tail..]
            .iter()
            .map(|it| diff_line(DiffKind::Same, it)),
    );
    out
}

fn lcs(a: &[&str], b: &[&str], out: &mut Vec<DiffLine>) {
    // length[i * width + j]: the LCS of a[i..] and b[j..].
    let width = b.len() + 1;
    let mut length = vec![0_u32; (a.len() + 1) * width];
    for i in (0..a.len()).rev() {
        for j in (0..b.len()).rev() {
            length[i * width + j] = if a[i] == b[j] {
                length[(i + 1) * width + j + 1] + 1
            } else {
                length[(i + 1) * width + j].max(length[i * width + j + 1])
            };
        }
    }
    let (mut i, mut j) = (0, 0);
    while i < a.len() || j < b.len() {
        if i < a.len() && j < b.len() && a[i] == b[j] {
            out.push(diff_line(DiffKind::Same, a[i]));
            i += 1;
            j += 1;
        } else if i < a.len()
            // A removal goes ahead of the addition that replaces it.
            && (j == b.len() || length[(i + 1) * width + j] >= length[i * width + j + 1])
        {
            out.push(diff_line(DiffKind::Removed, a[i]));
            i += 1;
        } else {
            out.push(diff_line(DiffKind::Added, b[j]));
            j += 1;
        }
    }
}

/// `lines` with the kept lines more than [`CONTEXT`] away from every change left out.
fn with_context(lines: Vec<DiffLine>) -> Vec<DiffLine> {
    let mut near = vec![false; lines.len()];
    let mut changed = false;
    for (at, line) in lines.iter().enumerate() {
        if line.kind != DiffKind::Same {
            changed = true;
            let last = (at + CONTEXT).min(lines.len() - 1);
            near[at.saturating_sub(CONTEXT)..=last].fill(true);
        }
    }
    if !changed {
        return Vec::new();
    }
    lines
        .into_iter()
        .zip(near)
        .filter_map(|(line, near)| near.then_some(line))
        .collect()
}

/// What the file would hold after the call, for the diff viewer (nothing is written): an
/// `Edit`'s replacement put into `current` (every one with `replace_all`), a `Write`'s content.
/// `None` for an `Edit` whose `old_string` is not in `current`, and for any other tool.
pub fn content_after(
    tool_name: &str,
    input: Option<&Value>,
    current: Option<&str>,
) -> Option<String> {
    let fields = input?.as_object()?;
    match tool_name {
        EDIT => {
            let old = fields.string("old_string").filter(|it| !it.is_empty())?;
            let new = fields.string("new_string")?;
            let now = current.unwrap_or_default();
            if !now.contains(old) {
                None
            } else if replace_all(fields) {
                Some(now.replace(old, new))
            } else {
                Some(now.replacen(old, new, 1))
            }
        }
        WRITE => fields.string("content").map(str::to_owned),
        _ => None,
    }
}

/// The two sides the diff viewer shows for the call: the file now and [`content_after`] it; for
/// an `Edit` whose text is not in the file (any more), its `old_string` against its
/// `new_string`. `None` when there is nothing to show.
pub fn diff_sides(
    tool_name: &str,
    input: Option<&Value>,
    current: Option<&str>,
) -> Option<(String, String)> {
    if let Some(after) = content_after(tool_name, input, current) {
        return Some((current.unwrap_or_default().to_owned(), after));
    }
    let fields = input?.as_object()?;
    let old = fields.string("old_string")?;
    let new = fields.string("new_string")?;
    (tool_name == EDIT).then(|| (old.to_owned(), new.to_owned()))
}
