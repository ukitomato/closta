//! The overlays: the Bypass banner, which overlay is up, and the new-session dialog.

use super::*;

impl ShellState {
    /// Whether the slot's Bypass banner is up.
    pub fn bypass_asking(&self, slot: SlotId) -> bool {
        self.slots.get(&slot).is_some_and(|it| it.bypass_asking)
    }

    pub(super) fn pick_mode(&mut self, slot: SlotId, mode: &str) -> Acted {
        let Some(held) = self.slots.get_mut(&slot) else {
            return Acted::default();
        };
        let Some(commands) = held.runtime.commands() else {
            return Acted::default();
        };
        let current = held.line.as_ref();
        if held.mode_sent
            || current.is_some_and(|it| it.switching || it.mode.as_deref() == Some(mode))
            || !PERMISSION_MODES.contains(&mode)
        {
            return Acted::default();
        }
        if mode == BYPASS_MODE {
            held.bypass_asking = true;
        } else {
            held.mode_sent = commands.switch_mode(mode).is_ok();
            held.bypass_asking = false;
        }
        Acted::default()
    }

    pub(super) fn confirm_bypass(&mut self, slot: SlotId) -> Acted {
        let Some(held) = self.slots.get_mut(&slot).filter(|it| it.bypass_asking) else {
            return Acted::default();
        };
        let line = held.line.as_ref();
        if held.mode_sent || line.is_some_and(|it| it.switching) {
            return Acted::default();
        }
        if line.is_some_and(|it| it.mode.as_deref() == Some(BYPASS_MODE)) {
            held.bypass_asking = false;
            return Acted::default();
        }
        if let Some(commands) = held.runtime.commands() {
            held.mode_sent = commands.switch_mode(BYPASS_MODE).is_ok();
        }
        held.bypass_asking = false;
        Acted::default()
    }

    /// The overlay that is up; the window's own steps come before a slot's question, and that
    /// before the dialog.
    pub fn overlay(&self) -> Option<Overlay> {
        if self.closing == CloseStage::Closing {
            Some(Overlay::Closing)
        } else if matches!(self.closing, CloseStage::Asking(_)) {
            Some(Overlay::CloseWindow)
        } else if self.slot_close.is_some() {
            Some(Overlay::CloseSlot)
        } else if self.dialog.is_some() {
            Some(Overlay::NewSession)
        } else {
            None
        }
    }

    pub(super) fn edit_folder(&mut self, text: String) -> Acted {
        let Some(dialog) = self.dialog.as_mut() else {
            return Acted::default();
        };
        if dialog.checking || dialog.folder == text {
            return Acted::default();
        }
        dialog.problem = quick_problem(&text, self.ports.checks.as_ref());
        dialog.folder = text;
        Acted {
            folder: true,
            ..Acted::default()
        }
    }

    /// The dialog with the folder of the selected slot's project, or else of the project under
    /// the list's cursor (the parent of a slot there), in its field.
    pub(super) fn open_new_session_here(&mut self) -> Acted {
        if self.dialog.is_some() {
            return Acted::default();
        }
        let selected = self.selected.and_then(|slot| self.project_of(slot));
        let under_cursor = || match self.nav_cursor()? {
            NavItem::Project(key) => Some(key),
            NavItem::Slot(slot) | NavItem::NeedsYou(slot) => self.project_of(*slot),
        };
        let folder = selected
            .or_else(under_cursor)
            .and_then(|key| self.projects.iter().find(|project| &project.key == key))
            .map(|project| project.folder.clone())
            .unwrap_or_default();
        let problem = quick_problem(&folder, self.ports.checks.as_ref());
        self.dialog = Some(NewSessionDialog {
            folder,
            problem,
            checking: false,
        });
        Acted {
            folder: true,
            ..Acted::default()
        }
    }

    pub(super) fn start_session(&mut self, folder: String) -> Acted {
        if self.slots_full() {
            return Acted::default();
        }
        let Some(dialog) = self.dialog.as_mut() else {
            return Acted::default();
        };
        if dialog.checking
            || folder.trim() != dialog.folder.trim()
            || folder.trim().is_empty()
            || quick_problem(&folder, self.ports.checks.as_ref()).is_some()
        {
            return Acted::default();
        }
        dialog.checking = true;
        let folder = folder.trim().to_owned();
        let exists = self.ports.checks.folder_exists(&folder);
        Acted {
            check: Some(FolderCheck { folder, exists }),
            ..Acted::default()
        }
    }

    pub(super) fn folder_checked(&mut self, folder: &str, exists: bool) -> Acted {
        if self.slots_full() {
            return Acted::default();
        }
        let Some(dialog) = self.dialog.as_mut() else {
            return Acted::default();
        };
        if !dialog.checking || folder.trim() != dialog.folder.trim() {
            return Acted::default();
        }
        if !exists {
            dialog.problem = Some(Problem::FolderMissing);
            dialog.checking = false;
            return Acted::default();
        }
        let folder = folder.trim();
        let slot = self.open(launch_in(folder, &self.ports));
        self.select(slot);
        self.recent.push(folder);
        self.dialog = None;
        Acted {
            started: Some(slot),
            ..Acted::default()
        }
    }
}
