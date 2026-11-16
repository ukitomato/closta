//! What the bottom sessions window decides: its rows, which session stays selected, when the
//! detail may take an answer, and since when a session sits under its heading
//! (SessionsWindow.kt). The screens only show these. Times are milliseconds since the epoch, given
//! by the caller: the presenter reads no clock.

use std::collections::HashSet;

use super::groups::SessionGroup;

/// A heading of the sessions tree; the tree shows the groups in this order.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum WindowGroup {
    Waiting,
    Running,
    Finished,
    WasRunning,
}

impl WindowGroup {
    /// Every heading, in the order the tree shows them.
    pub const ALL: [WindowGroup; 4] = [
        WindowGroup::Waiting,
        WindowGroup::Running,
        WindowGroup::Finished,
        WindowGroup::WasRunning,
    ];
}

/// The heading a session of `group` sits under.
pub fn window_group_of(group: SessionGroup) -> WindowGroup {
    match group {
        SessionGroup::Waiting => WindowGroup::Waiting,
        SessionGroup::Running => WindowGroup::Running,
        SessionGroup::Unread | SessionGroup::Other => WindowGroup::Finished,
    }
}

/// A row of the sessions tree: a heading with the number of items under it, or one item.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum WindowRow<T> {
    Header { group: WindowGroup, count: usize },
    Item(T),
}

/// Items under their headings; empty groups have no heading; inside `Finished` the `unread` ones
/// come first, else the order is kept.
pub fn window_rows<T: Clone>(
    items: &[T],
    group_of: impl Fn(&T) -> WindowGroup,
    unread: impl Fn(&T) -> bool,
) -> Vec<WindowRow<T>> {
    let groups: Vec<WindowGroup> = items.iter().map(&group_of).collect();
    let mut rows = Vec::with_capacity(items.len() + WindowGroup::ALL.len());
    for group in WindowGroup::ALL {
        let mut members: Vec<&T> = items
            .iter()
            .zip(&groups)
            .filter(|(_, of)| **of == group)
            .map(|(item, _)| item)
            .collect();
        if members.is_empty() {
            continue;
        }
        if group == WindowGroup::Finished {
            // Stable, so the unread keep their order, and so do the others.
            members.sort_by_key(|it| if unread(it) { 0 } else { 1 });
        }
        rows.push(WindowRow::Header {
            group,
            count: members.len(),
        });
        rows.extend(members.into_iter().cloned().map(WindowRow::Item));
    }
    rows
}

/// The selection after the list changed: `selected` if still in `ids`, else `None`. Never
/// another session.
pub fn kept_selection(selected: Option<&str>, ids: &[String]) -> Option<String> {
    selected
        .filter(|it| ids.iter().any(|id| id == it))
        .map(str::to_owned)
}

/// The waiting session after `selected` in `waiting_ids` (wrapping); the first when `selected`
/// is not waiting; `None` when none waits.
pub fn next_waiting(selected: Option<&str>, waiting_ids: &[String]) -> Option<String> {
    let at = selected.and_then(|selected| waiting_ids.iter().position(|it| it == selected));
    match at {
        Some(at) => Some(waiting_ids[(at + 1) % waiting_ids.len()].clone()),
        None => waiting_ids.first().cloned(),
    }
}

/// How long an ask must have been shown before the detail takes an answer to it.
pub const ANSWER_DELAY_MS: i64 = 500;

/// What the detail shows for answering, and since when (the delay counts from `since_ms`).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ShownAsk {
    pub session_id: String,
    pub request_id: Option<String>,
    pub since_ms: i64,
}

/// Keeps `before`'s time when session and request are the same, else starts again at `now_ms`.
pub fn shown_after(
    before: Option<&ShownAsk>,
    session_id: &str,
    request_id: Option<&str>,
    now_ms: i64,
) -> ShownAsk {
    match before {
        Some(before)
            if before.session_id == session_id && before.request_id.as_deref() == request_id =>
        {
            before.clone()
        }
        _ => ShownAsk {
            session_id: session_id.to_owned(),
            request_id: request_id.map(str::to_owned),
            since_ms: now_ms,
        },
    }
}

/// An answer to `request_id` is accepted: it is the shown one, it still waits, and
/// `ANSWER_DELAY_MS` has passed since it was shown. A clock that went back (`now_ms` before
/// `since_ms`) has not passed it.
pub fn accepts_answer(
    shown: Option<&ShownAsk>,
    request_id: &str,
    still_waiting: &HashSet<String>,
    now_ms: i64,
) -> bool {
    shown.is_some_and(|shown| {
        shown.request_id.as_deref() == Some(request_id)
            && still_waiting.contains(request_id)
            && now_ms.saturating_sub(shown.since_ms) >= ANSWER_DELAY_MS
    })
}

/// When a session came under its heading; `since_ms` is `None` when the client did not see it
/// come (first seen, resumed). Kept per heading, not per [`SessionGroup`]: reading a finished
/// session (`Unread` to `Other`) keeps the time it finished.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct GroupSince {
    pub group: WindowGroup,
    pub since_ms: Option<i64>,
}

/// The same heading keeps `before`; another heading starts at `now_ms`; no `before` starts at an
/// unknown time.
pub fn group_since_after(
    before: Option<&GroupSince>,
    group: SessionGroup,
    now_ms: i64,
) -> GroupSince {
    let heading = window_group_of(group);
    match before {
        None => GroupSince {
            group: heading,
            since_ms: None,
        },
        Some(before) if before.group == heading => *before,
        Some(_) => GroupSince {
            group: heading,
            since_ms: Some(now_ms),
        },
    }
}
