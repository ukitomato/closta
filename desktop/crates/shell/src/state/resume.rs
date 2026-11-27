//! The resume popup: opened on a project, its saved sessions read in the background, the answer
//! of an earlier reading dropped.

use super::*;
use crate::new_session::resume_in;
use crate::projects::display_name;
use crate::resume::{ResumeRow, ResumeRowState, ResumeStage};

impl ShellState {
    /// The resume popup, while it is up.
    pub fn resume(&self) -> Option<&ResumePicker> {
        self.resume.as_ref()
    }

    /// The popup's filtered rows, each with whether a slot holds its conversation.
    pub fn resume_rows(&self) -> Vec<ResumeRow> {
        let Some(picker) = &self.resume else {
            return Vec::new();
        };
        picker
            .filtered()
            .into_iter()
            .map(|summary| ResumeRow {
                id: summary.id.clone(),
                title: summary.title.clone(),
                updated_at_ms: summary.updated_at_ms,
                state: self.resume_row_state(&summary.id),
            })
            .collect()
    }

    /// The popup's title, with its project's name.
    pub fn resume_title(&self) -> Option<String> {
        let picker = self.resume.as_ref()?;
        let project = self.projects.iter().find(|it| it.key == picker.project)?;
        Some(copy::resume_title(&display_name(project, &self.projects)))
    }

    /// The id of the row picked in the popup, which Enter opens; `None` while no row is shown.
    pub fn resume_picked(&self) -> Option<String> {
        let picker = self.resume.as_ref()?;
        picker
            .filtered()
            .get(picker.selected)
            .map(|summary| summary.id.clone())
    }

    /// Whether the resume popup may be opened now: no overlay is up and no plus waits for its
    /// folder, so its button may be pressed.
    pub fn can_open_resume(&self) -> bool {
        self.overlay().is_none() && self.pending_new.is_none()
    }

    fn resume_row_state(&self, session_id: &str) -> ResumeRowState {
        let mut holding = self
            .slots
            .iter()
            .filter(|(_, slot)| slot.session_id == session_id);
        if let Some((id, _)) = holding.clone().find(|(_, slot)| !slot.closing) {
            ResumeRowState::OpenHere(*id)
        } else if holding.next().is_some() || self.run_alive(session_id) {
            ResumeRowState::Closing
        } else {
            ResumeRowState::Closed
        }
    }

    pub(super) fn open_resume(&mut self, key: &ProjectKey) -> Acted {
        // A plus that waits for its folder may yet open the dialog: the two never stand together.
        if !self.can_open_resume() {
            return Acted::default();
        }
        let Some(folder) = self.folder_of(key) else {
            return Acted::default();
        };
        self.last_listing += 1;
        let picker = ResumePicker::new(key.clone(), self.last_listing);
        let listing = self.ports.saved_for.list(&folder, picker.stop());
        self.resume = Some(picker);
        Acted {
            listing: Some(ResumeListing {
                generation: self.last_listing,
                listing,
            }),
            ..Acted::default()
        }
    }

    pub(super) fn open_resume_here(&mut self) -> Acted {
        match self.project_at_hand().cloned() {
            Some(key) => self.open_resume(&key),
            None => Acted::default(),
        }
    }

    pub(super) fn saved_listed(&mut self, generation: u64, listing: Option<SavedListing>) -> Acted {
        let Some(picker) = self
            .resume
            .as_mut()
            .filter(|it| it.generation() == generation)
        else {
            return Acted::default();
        };
        let Some(listing) = listing else {
            return Acted::default();
        };
        picker.stage = if listing.unreadable {
            ResumeStage::Unreadable
        } else {
            ResumeStage::Listed(listing.sessions)
        };
        picker.selected = 0;
        Acted::default()
    }

    pub(super) fn edit_resume_query(&mut self, text: String) -> Acted {
        if let Some(picker) = self.resume.as_mut() {
            picker.query = text;
            picker.selected = 0;
        }
        Acted::default()
    }

    pub(super) fn move_resume(&mut self, delta: i32) -> Acted {
        if let Some(picker) = self.resume.as_mut() {
            let last = picker.filtered().len().saturating_sub(1);
            let moved = i64::try_from(picker.selected)
                .unwrap_or(i64::MAX)
                .saturating_add(i64::from(delta));
            picker.selected = usize::try_from(moved.max(0))
                .unwrap_or(usize::MAX)
                .min(last);
        }
        Acted::default()
    }

    /// Resumes the listed session `session_id` in a new slot of the popup's project, or goes to
    /// the slot that already holds it: two runs never share one session id.
    pub(super) fn pick_resume(&mut self, session_id: &str) -> Acted {
        let Some(picker) = self.resume.as_ref() else {
            return Acted::default();
        };
        let ResumeStage::Listed(sessions) = &picker.stage else {
            return Acted::default();
        };
        let Some(summary) = sessions.iter().find(|it| it.id == session_id).cloned() else {
            return Acted::default();
        };
        let project = picker.project.clone();
        let holding = self
            .slots
            .iter()
            .find(|(_, slot)| slot.session_id == session_id && !slot.closing)
            .map(|(id, _)| *id);
        if let Some(slot) = holding {
            self.close_resume();
            self.select(slot);
            return Acted {
                focus: self.use_of(slot),
                ..Acted::default()
            };
        }
        if self.resume_row_state(session_id) == ResumeRowState::Closing || self.slots_full() {
            return Acted::default();
        }
        let Some(folder) = self.folder_of(&project) else {
            return Acted::default();
        };
        self.close_resume();
        let slot = self.open(resume_in(&folder, &summary, &self.ports));
        self.select(slot);
        Acted {
            started: Some(slot),
            focus: Some(FocusTarget::Composer(slot)),
            ..Acted::default()
        }
    }

    pub(super) fn close_resume(&mut self) -> Acted {
        if let Some(picker) = self.resume.take() {
            picker.halt();
        }
        Acted::default()
    }
}
