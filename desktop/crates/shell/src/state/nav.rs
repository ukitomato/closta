//! The left list's cursor: the rows it walks, and what its keys do.

use super::*;
use crate::nav::{TreeRow, moved, nav_items, settle, tree_of};

impl ShellState {
    /// The tree under the needs-you rows: the projects, each with its slots in the order they
    /// were opened while it is open, then the slots with no project. A slot that is closing
    /// stays.
    pub fn tree_rows(&self) -> Vec<TreeRow> {
        let projects: Vec<(ProjectKey, bool)> = self
            .projects
            .iter()
            .map(|project| (project.key.clone(), project.collapsed))
            .collect();
        let slots: Vec<(SlotId, Option<ProjectKey>)> = self
            .slots
            .iter()
            .map(|(id, held)| (*id, held.project.clone()))
            .collect();
        tree_of(&projects, &slots)
    }

    /// Every row the cursor can stand on, from the top: the needs-you rows, then the tree.
    pub fn nav_rows(&self) -> Vec<NavItem> {
        let waiting: Vec<SlotId> = self.needs_you().iter().map(|row| row.slot).collect();
        nav_items(&waiting, &self.tree_rows())
    }

    pub fn nav_cursor(&self) -> Option<&NavItem> {
        self.nav.as_ref().map(|(item, _)| item)
    }

    /// Holds the cursor to the rows as they are now. With no cursor there is nothing to hold.
    pub(super) fn settle_nav(&mut self) {
        let Some(cursor) = self.nav.take() else {
            return;
        };
        self.nav = settle(Some(cursor), &self.nav_rows());
    }

    /// The row of the selected slot in `rows`: its own, or its project's when that is closed.
    fn selected_place(&self, rows: &[NavItem]) -> Option<usize> {
        let slot = self.selected?;
        let own = rows
            .iter()
            .position(|it| matches!(it, NavItem::Slot(shown) if *shown == slot));
        own.or_else(|| {
            let key = self.project_of(slot)?;
            rows.iter()
                .position(|it| matches!(it, NavItem::Project(shown) if shown == key))
        })
    }

    fn put_cursor(&mut self, item: &NavItem) {
        let rows = self.nav_rows();
        if let Some(place) = rows.iter().position(|it| it == item) {
            self.nav = Some((item.clone(), place));
        }
    }

    pub(super) fn nav_focus(&mut self) -> Acted {
        // The list cannot take focus while its pane is shut.
        if !self.panes.left_open {
            self.panes.toggle(Pane::Left);
        }
        let rows = self.nav_rows();
        let place = self.selected_place(&rows).unwrap_or(0);
        self.nav = rows.get(place).map(|item| (item.clone(), place));
        Acted {
            focus: Some(FocusTarget::Nav),
            ..Acted::default()
        }
    }

    pub(super) fn nav_move(&mut self, delta: i32) -> Acted {
        let rows = self.nav_rows();
        let selected = self.selected_place(&rows);
        self.nav = moved(self.nav.as_ref(), &rows, selected, delta);
        Acted::default()
    }

    pub(super) fn nav_to(&mut self, item: NavItem) -> Acted {
        self.put_cursor(&item);
        Acted {
            focus: Some(FocusTarget::Nav),
            ..Acted::default()
        }
    }

    pub(super) fn nav_enter(&mut self) -> Acted {
        match self.nav_cursor().cloned() {
            Some(NavItem::NeedsYou(slot)) => self.open_from_list(slot),
            Some(NavItem::Project(key)) => {
                self.toggle_project(&key);
                Acted::default()
            }
            Some(NavItem::Slot(slot)) => self.go_to_slot(slot),
            None => Acted::default(),
        }
    }

    /// Selects the slot and says where it can be used.
    fn go_to_slot(&mut self, slot: SlotId) -> Acted {
        let Some(focus) = self.use_of(slot) else {
            return Acted::default();
        };
        self.select(slot);
        Acted {
            focus: Some(focus),
            ..Acted::default()
        }
    }

    pub(super) fn nav_leave(&mut self) -> Acted {
        Acted {
            focus: self.selected.and_then(|slot| self.use_of(slot)),
            ..Acted::default()
        }
    }

    /// Where the slot can be used: its input, or the band that says why it cannot.
    pub(super) fn use_of(&self, slot: SlotId) -> Option<FocusTarget> {
        let held = self.slots.get(&slot)?;
        Some(match held.status {
            SessionStatus::Failed(_) => FocusTarget::FailureBand(slot),
            SessionStatus::Ended => FocusTarget::EndedBand(slot),
            _ => FocusTarget::Composer(slot),
        })
    }

    pub(super) fn nav_left(&mut self) -> Acted {
        match self.nav_cursor().cloned() {
            Some(NavItem::Project(key)) => self.set_collapsed(&key, true),
            Some(NavItem::Slot(slot)) => {
                if let Some(key) = self.project_of(slot).cloned() {
                    self.put_cursor(&NavItem::Project(key));
                }
            }
            Some(NavItem::NeedsYou(_)) | None => {}
        }
        Acted::default()
    }

    pub(super) fn nav_right(&mut self) -> Acted {
        if let Some(NavItem::Project(key)) = self.nav_cursor().cloned() {
            self.set_collapsed(&key, false);
        }
        Acted::default()
    }

    fn set_collapsed(&mut self, key: &ProjectKey, collapsed: bool) {
        if self
            .projects
            .iter()
            .any(|it| &it.key == key && it.collapsed != collapsed)
        {
            self.toggle_project(key);
        }
    }
}
