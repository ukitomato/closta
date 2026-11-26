//! The projects of the shell: made by the folders sessions open in, kept in order, opened and
//! closed by hand, and saved to the settings.

use std::fmt;

use super::{Acted, ShellState, SlotId};
use crate::copy;
use crate::projects::{Project, ProjectKey, display_name, project_key};
use crate::settings::Settings;

/// One project as the tree shows its row.
#[derive(Clone, PartialEq, Eq)]
pub struct ProjectSummary {
    pub key: ProjectKey,
    /// The name that tells it from projects of the same name.
    pub name: String,
    /// `"WSL"` or `"Windows"`.
    pub runtime: &'static str,
    pub collapsed: bool,
    /// Whether the folder is being looked for before a session starts in it.
    pub checking: bool,
    pub can_add: bool,
    pub can_remove: bool,
}

// Written by hand: the name is the user's.
impl fmt::Debug for ProjectSummary {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProjectSummary")
            .field("name_len", &self.name.len())
            .field("runtime", &self.runtime)
            .field("collapsed", &self.collapsed)
            .field("checking", &self.checking)
            .field("can_add", &self.can_add)
            .field("can_remove", &self.can_remove)
            .finish()
    }
}

impl ShellState {
    /// Puts the projects of the settings after those already there, in their order and state;
    /// an entry with no key or whose place is already there is dropped. Nothing is written and
    /// no session starts: what is saved next is compared with what is kept now.
    pub fn restore_projects(&mut self, settings: &Settings) {
        for entry in &settings.projects {
            let Some(mut project) = Project::new(&entry.folder) else {
                continue;
            };
            if self.projects.iter().any(|kept| kept.key == project.key) {
                continue;
            }
            project.collapsed = entry.collapsed;
            self.projects.push(project);
        }
        self.saved = Some(Settings::of(&self.projects));
        self.settle_nav();
    }

    /// The projects in the order they were made in.
    pub fn projects(&self) -> Vec<ProjectSummary> {
        let can_add = !self.slots_full() && self.pending_new.is_none();
        self.projects
            .iter()
            .map(|project| ProjectSummary {
                key: project.key.clone(),
                name: display_name(project, &self.projects),
                runtime: copy::runtime_kind(&project.runtime),
                collapsed: project.collapsed,
                checking: self.pending_new.as_ref() == Some(&project.key),
                can_add,
                can_remove: self.has_no_live_slot(&project.key),
            })
            .collect()
    }

    /// The project the slot is listed in; none for a slot with no folder or one that is not
    /// there.
    pub fn project_of(&self, slot: SlotId) -> Option<&ProjectKey> {
        self.slots.get(&slot)?.project.as_ref()
    }

    /// The folders the New Session dialog offers: the recent ones, then those of the projects
    /// not among them, in the projects' order.
    pub fn folder_choices(&self) -> Vec<String> {
        let recent = self.recent.list();
        let keys: Vec<ProjectKey> = recent.iter().filter_map(|it| project_key(it)).collect();
        let mut choices = recent.to_vec();
        choices.extend(
            self.projects
                .iter()
                .filter(|project| !keys.contains(&project.key))
                .map(|project| project.folder.clone()),
        );
        choices
    }

    /// The key of the project of `folder`, made at the end of the list when it is not there yet.
    pub(super) fn join_project(&mut self, folder: &str) -> Option<ProjectKey> {
        let project = Project::new(folder)?;
        let key = project.key.clone();
        if !self.projects.iter().any(|kept| kept.key == key) {
            self.projects.push(project);
            self.save_projects();
        }
        Some(key)
    }

    /// Whether no slot of the project is alive, closing or holding a draft.
    fn has_no_live_slot(&self, key: &ProjectKey) -> bool {
        !self.slots.values().any(|slot| {
            slot.project.as_ref() == Some(key) && (slot.is_live() || slot.composer.has_draft())
        })
    }

    /// Takes the project and its ended slots off the list and saves the rest; a project with a
    /// live, closing or drafted slot stays as it is. No file is touched.
    pub(super) fn remove_project(&mut self, key: &ProjectKey) -> Acted {
        if !self.projects.iter().any(|it| &it.key == key) || !self.has_no_live_slot(key) {
            return Acted::default();
        }
        let gone: Vec<SlotId> = self
            .slots
            .iter()
            .filter(|(_, slot)| slot.project.as_ref() == Some(key))
            .map(|(id, _)| *id)
            .collect();
        for slot in &gone {
            self.remove(*slot);
        }
        self.projects.retain(|it| &it.key != key);
        // Its answer, when it comes, finds nothing waiting for it.
        if self.pending_new.as_ref() == Some(key) {
            self.pending_new = None;
        }
        self.save_projects();
        Acted {
            removed: gone,
            ..Acted::default()
        }
    }

    pub(super) fn toggle_project(&mut self, key: &ProjectKey) {
        let Some(project) = self.projects.iter_mut().find(|it| &it.key == key) else {
            return;
        };
        project.collapsed = !project.collapsed;
        self.save_projects();
    }

    /// Hands the settings to the writer unless they are what it already has.
    fn save_projects(&mut self) {
        let settings = Settings::of(&self.projects);
        if self.saved.as_ref() == Some(&settings) {
            return;
        }
        self.saved = Some(settings.clone());
        self.ports.settings.save(settings);
    }

    /// The one way to select a slot: a collapsed project the slot is in opens.
    pub(crate) fn select(&mut self, slot: SlotId) {
        self.selected = Some(slot);
        if let Some(held) = self.slots.get_mut(&slot) {
            held.unread = false;
        }
        let Some(key) = self.slots.get(&slot).and_then(|it| it.project.clone()) else {
            return;
        };
        if let Some(project) = self.projects.iter_mut().find(|it| it.key == key)
            && project.collapsed
        {
            project.collapsed = false;
            self.save_projects();
        }
    }
}
