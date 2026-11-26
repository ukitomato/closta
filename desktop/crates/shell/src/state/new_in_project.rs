//! The project row's plus: a session in the project's folder, started once the folder is found.

use super::*;

/// A project's folder to look for in the background; its answer comes back as `ProjectChecked`.
pub struct ProjectCheck {
    pub project: ProjectKey,
    pub exists: future::Boxed<bool>,
}

impl ShellState {
    /// The folder of the project, as it was first written.
    fn folder_of(&self, key: &ProjectKey) -> Option<String> {
        self.projects
            .iter()
            .find(|it| &it.key == key)
            .map(|it| it.folder.clone())
    }

    pub(super) fn new_in_project(&mut self, key: &ProjectKey) -> Acted {
        if self.pending_new.is_some() || self.slots_full() {
            return Acted::default();
        }
        let Some(folder) = self.folder_of(key) else {
            return Acted::default();
        };
        if let Some(problem) = quick_problem(&folder, self.ports.checks.as_ref()) {
            self.dialog = Some(NewSessionDialog {
                folder,
                problem: Some(problem),
                checking: false,
            });
            return Acted {
                folder: true,
                ..Acted::default()
            };
        }
        let exists = self.ports.checks.folder_exists(&folder);
        self.pending_new = Some(key.clone());
        Acted {
            project_check: Some(ProjectCheck {
                project: key.clone(),
                exists,
            }),
            ..Acted::default()
        }
    }

    pub(super) fn project_checked(&mut self, key: &ProjectKey, exists: bool) -> Acted {
        if self.pending_new.as_ref() != Some(key) {
            return Acted::default();
        }
        self.pending_new = None;
        // The window is closing or asks to: nothing starts behind that question.
        if self.closing != CloseStage::Open || self.slots_full() {
            return Acted::default();
        }
        let Some(folder) = self.folder_of(key) else {
            return Acted::default();
        };
        if !exists {
            // Another overlay keeps what it shows; only the check ends.
            if self.overlay().is_some() {
                return Acted::default();
            }
            self.dialog = Some(NewSessionDialog {
                folder,
                problem: Some(Problem::FolderMissing),
                checking: false,
            });
            return Acted {
                folder: true,
                ..Acted::default()
            };
        }
        let slot = self.open(launch_in(&folder, &self.ports));
        self.select(slot);
        self.recent.push(&folder);
        Acted {
            started: Some(slot),
            ..Acted::default()
        }
    }
}
