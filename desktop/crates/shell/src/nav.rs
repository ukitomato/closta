//! The left pane as one list: the needs-you rows, then the projects with their open sessions,
//! then the sessions that belong to no project. Pure: the cursor's rules and the rows are
//! built here from plain values so they can be tested, and measured, without a shell.

use crate::projects::ProjectKey;
use crate::slot::SlotId;

/// One row the left pane's cursor can stand on.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum NavItem {
    NeedsYou(SlotId),
    Project(ProjectKey),
    Slot(SlotId),
}

/// One row of the tree under the needs-you rows.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum TreeRow {
    Project(ProjectKey),
    Slot(SlotId),
    /// The heading of the sessions with no project; there only when there is such a session.
    Other,
}

/// The tree: each project in order, then, when it is open, its slots in the order they were
/// opened; then the heading for the slots whose key is not among the projects, and those
/// slots. `projects` pairs a key with whether the project is collapsed.
pub fn tree_of(
    projects: &[(ProjectKey, bool)],
    slots: &[(SlotId, Option<ProjectKey>)],
) -> Vec<TreeRow> {
    let mut tree = Vec::new();
    for (key, collapsed) in projects {
        tree.push(TreeRow::Project(key.clone()));
        if !collapsed {
            tree.extend(
                slots
                    .iter()
                    .filter(|(_, owner)| owner.as_ref() == Some(key))
                    .map(|(slot, _)| TreeRow::Slot(*slot)),
            );
        }
    }
    let loose: Vec<SlotId> = slots
        .iter()
        .filter(|(_, owner)| {
            !owner
                .as_ref()
                .is_some_and(|key| projects.iter().any(|(it, _)| it == key))
        })
        .map(|(slot, _)| *slot)
        .collect();
    if !loose.is_empty() {
        tree.push(TreeRow::Other);
        tree.extend(loose.into_iter().map(TreeRow::Slot));
    }
    tree
}

/// The cursor's items from the top: the needs-you rows, then the tree without its heading.
pub fn nav_items(needs_you: &[SlotId], tree: &[TreeRow]) -> Vec<NavItem> {
    let waiting = needs_you.iter().map(|slot| NavItem::NeedsYou(*slot));
    let rows = tree.iter().filter_map(|row| match row {
        TreeRow::Project(key) => Some(NavItem::Project(key.clone())),
        TreeRow::Slot(slot) => Some(NavItem::Slot(*slot)),
        TreeRow::Other => None,
    });
    waiting.chain(rows).collect()
}

/// Puts the cursor right after the rows were made again: its item if it is still there, else
/// the item now at the place it had (the last one past the end), and none for no rows.
pub fn settle(cursor: Option<(NavItem, usize)>, rows: &[NavItem]) -> Option<(NavItem, usize)> {
    let (item, place) = cursor?;
    if let Some(now) = rows.iter().position(|it| *it == item) {
        return Some((item, now));
    }
    let place = place.min(rows.len().checked_sub(1)?);
    Some((rows[place].clone(), place))
}

/// The cursor after an arrow: with none yet it lands on the selected row, else the first;
/// otherwise it moves by `delta` and stops at both ends.
pub fn moved(
    cursor: Option<&(NavItem, usize)>,
    rows: &[NavItem],
    selected: Option<usize>,
    delta: i32,
) -> Option<(NavItem, usize)> {
    let last = rows.len().checked_sub(1)?;
    let place = match cursor {
        None => selected.unwrap_or(0).min(last),
        Some((_, at)) => {
            let target = i64::try_from(*at)
                .unwrap_or(i64::MAX)
                .saturating_add(i64::from(delta));
            usize::try_from(target.max(0)).unwrap_or(0).min(last)
        }
    };
    Some((rows[place].clone(), place))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::project_key;

    fn key(folder: &str) -> ProjectKey {
        project_key(folder).unwrap()
    }

    fn slot(n: u64) -> SlotId {
        SlotId(n)
    }

    #[test]
    fn the_tree_lists_projects_then_their_open_slots_then_other() {
        let a = key(r"C:\w\a");
        let b = key(r"C:\w\b");
        let tree = tree_of(
            &[(a.clone(), false), (b.clone(), false)],
            &[
                (slot(1), Some(b.clone())),
                (slot(2), None),
                (slot(3), Some(a.clone())),
                (slot(4), Some(b.clone())),
                (slot(5), Some(key(r"C:\w\gone"))),
            ],
        );
        assert_eq!(
            tree,
            vec![
                TreeRow::Project(a),
                TreeRow::Slot(slot(3)),
                TreeRow::Project(b),
                TreeRow::Slot(slot(1)),
                TreeRow::Slot(slot(4)),
                TreeRow::Other,
                TreeRow::Slot(slot(2)),
                TreeRow::Slot(slot(5)),
            ]
        );
    }

    #[test]
    fn a_collapsed_project_shows_no_slots() {
        let a = key(r"C:\w\a");
        let tree = tree_of(&[(a.clone(), true)], &[(slot(1), Some(a.clone()))]);
        assert_eq!(tree, vec![TreeRow::Project(a)]);
    }

    #[test]
    fn other_is_shown_only_with_a_slot_without_a_project() {
        let a = key(r"C:\w\a");
        let tree = tree_of(&[(a.clone(), false)], &[(slot(1), Some(a.clone()))]);
        assert!(!tree.contains(&TreeRow::Other));
        assert!(tree_of(&[], &[]).is_empty());
        let tree = tree_of(&[], &[(slot(1), None)]);
        assert_eq!(tree, vec![TreeRow::Other, TreeRow::Slot(slot(1))]);
    }

    #[test]
    fn the_items_are_needs_you_rows_then_the_tree() {
        let a = key(r"C:\w\a");
        let tree = vec![
            TreeRow::Project(a.clone()),
            TreeRow::Slot(slot(1)),
            TreeRow::Other,
            TreeRow::Slot(slot(2)),
        ];
        assert_eq!(
            nav_items(&[slot(2), slot(1)], &tree),
            vec![
                NavItem::NeedsYou(slot(2)),
                NavItem::NeedsYou(slot(1)),
                NavItem::Project(a),
                NavItem::Slot(slot(1)),
                NavItem::Slot(slot(2)),
            ]
        );
    }

    fn slots(ids: &[u64]) -> Vec<NavItem> {
        ids.iter().map(|n| NavItem::Slot(slot(*n))).collect()
    }

    #[test]
    fn a_cursor_whose_item_is_still_there_follows_it() {
        let rows = slots(&[9, 1, 2]);
        let cursor = Some((NavItem::Slot(slot(2)), 1));
        assert_eq!(settle(cursor, &rows), Some((NavItem::Slot(slot(2)), 2)));
    }

    #[test]
    fn a_cursor_whose_item_went_takes_the_same_place() {
        let cursor = Some((NavItem::Slot(slot(2)), 2));
        let rows = slots(&[0, 1, 5, 6]);
        assert_eq!(
            settle(cursor.clone(), &rows),
            Some((NavItem::Slot(slot(5)), 2))
        );
        let rows = slots(&[0, 1]);
        assert_eq!(settle(cursor, &rows), Some((NavItem::Slot(slot(1)), 1)));
    }

    #[test]
    fn an_empty_list_has_no_cursor() {
        assert_eq!(settle(Some((NavItem::Slot(slot(1)), 0)), &[]), None);
        assert_eq!(settle(None, &[]), None);
        assert_eq!(settle(None, &slots(&[1])), None, "settling never makes one");
    }

    #[test]
    fn moving_from_no_cursor_starts_at_the_selected_row_or_the_first() {
        let rows = slots(&[1, 2, 3]);
        assert_eq!(
            moved(None, &rows, Some(2), 1),
            Some((NavItem::Slot(slot(3)), 2))
        );
        assert_eq!(
            moved(None, &rows, None, -1),
            Some((NavItem::Slot(slot(1)), 0))
        );
        assert_eq!(moved(None, &[], None, 1), None);
    }

    #[test]
    fn moving_stops_at_both_ends() {
        let rows = slots(&[1, 2, 3]);
        let at = |n: usize| (rows[n].clone(), n);
        assert_eq!(moved(Some(&at(0)), &rows, None, -1), Some(at(0)));
        assert_eq!(moved(Some(&at(0)), &rows, None, 1), Some(at(1)));
        assert_eq!(moved(Some(&at(2)), &rows, None, 1), Some(at(2)));
        assert_eq!(moved(Some(&at(2)), &rows, None, -1), Some(at(1)));
    }
}
