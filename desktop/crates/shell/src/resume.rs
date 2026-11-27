//! The resume popup: the saved sessions of one project, read in the background each time it
//! opens, filtered by what the search field holds.

use std::fmt;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use closta_core::ports::MAX_LISTED;
use closta_model::SavedSessionSummary;
use closta_session::history::SavedListing;
use futures_lite::future;

use crate::projects::ProjectKey;
use crate::slot::SlotId;

/// The popup of one project, from the moment it opens until it closes.
pub struct ResumePicker {
    pub project: ProjectKey,
    pub stage: ResumeStage,
    /// The search field's text: the user's, so `Debug` gives its length only.
    pub query: String,
    /// The row picked among the filtered ones.
    pub selected: usize,
    /// The number of the reading this popup waits for.
    generation: u64,
    /// Turns true once the popup closes, so the reading gives up.
    stop: Arc<AtomicBool>,
}

#[derive(Clone, PartialEq, Eq)]
pub enum ResumeStage {
    Loading,
    Listed(Vec<SavedSessionSummary>),
    Unreadable,
}

/// One row of the popup.
#[derive(Clone, PartialEq, Eq)]
pub struct ResumeRow {
    pub id: String,
    pub title: String,
    pub updated_at_ms: i64,
    pub state: ResumeRowState,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ResumeRowState {
    /// No slot holds the conversation.
    Closed,
    /// This slot holds it: picking the row goes there.
    OpenHere(SlotId),
    /// A slot holding it is closing, or a run of it has not returned: it cannot be opened yet.
    Closing,
}

/// The reading the popup waits for, to run in the background; its answer comes back as
/// `SavedListed` with the same `generation`.
pub struct ResumeListing {
    pub generation: u64,
    pub listing: future::Boxed<Option<SavedListing>>,
}

impl ResumePicker {
    /// A popup on `project` that waits for reading `generation`.
    pub(crate) fn new(project: ProjectKey, generation: u64) -> ResumePicker {
        ResumePicker {
            project,
            stage: ResumeStage::Loading,
            query: String::new(),
            selected: 0,
            generation,
            stop: Arc::new(AtomicBool::new(false)),
        }
    }

    pub(crate) fn generation(&self) -> u64 {
        self.generation
    }

    /// The flag the reading gives up on.
    pub(crate) fn stop(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.stop)
    }

    /// Tells the reading to give up.
    pub(crate) fn halt(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }

    /// The saved sessions whose `"{title} {id}"` holds the search text in any case, newest
    /// first, at most [`MAX_LISTED`]; all of them for an empty search, none until listed.
    pub fn filtered(&self) -> Vec<&SavedSessionSummary> {
        let ResumeStage::Listed(sessions) = &self.stage else {
            return Vec::new();
        };
        let query = self.query.to_lowercase();
        sessions
            .iter()
            .filter(|it| {
                query.is_empty()
                    || format!("{} {}", it.title, it.id)
                        .to_lowercase()
                        .contains(&query)
            })
            .take(MAX_LISTED)
            .collect()
    }
}

// Written by hand: the search text and the titles are the user's.
impl fmt::Debug for ResumePicker {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ResumePicker")
            .field("stage", &self.stage)
            .field("query_len", &self.query.len())
            .field("selected", &self.selected)
            .finish()
    }
}

impl fmt::Debug for ResumeStage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ResumeStage::Loading => write!(f, "Loading"),
            ResumeStage::Listed(sessions) => write!(f, "Listed({})", sessions.len()),
            ResumeStage::Unreadable => write!(f, "Unreadable"),
        }
    }
}

impl fmt::Debug for ResumeRow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ResumeRow")
            .field("id", &self.id)
            .field("state", &self.state)
            .finish()
    }
}

impl fmt::Debug for ResumeListing {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ResumeListing")
            .field("generation", &self.generation)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::project_key;

    fn summary(id: &str, title: &str) -> SavedSessionSummary {
        SavedSessionSummary {
            id: id.to_owned(),
            title: title.to_owned(),
            updated_at_ms: 1,
            bytes: 1,
        }
    }

    fn listed(sessions: Vec<SavedSessionSummary>, query: &str) -> ResumePicker {
        let key = project_key(r"C:\work\closta").expect("a key");
        let mut picker = ResumePicker::new(key, 1);
        picker.stage = ResumeStage::Listed(sessions);
        picker.query = query.to_owned();
        picker
    }

    fn ids(picker: &ResumePicker) -> Vec<&str> {
        picker.filtered().iter().map(|it| it.id.as_str()).collect()
    }

    #[test]
    fn the_rows_are_matched_on_title_and_id_in_any_case() {
        let sessions = vec![
            summary("aaa-111", "Fix the CI cache key"),
            summary("bbb-222", "Split AuthService"),
            summary("ccc-FIX", "Retry the login"),
        ];
        assert_eq!(
            ids(&listed(sessions.clone(), "fix")),
            ["aaa-111", "ccc-FIX"]
        );
        assert_eq!(ids(&listed(sessions.clone(), "AUTH")), ["bbb-222"]);
        assert_eq!(ids(&listed(sessions.clone(), "BBB-2")), ["bbb-222"]);
        // The title and the id are one text with a space between them.
        assert_eq!(ids(&listed(sessions.clone(), "key aaa")), ["aaa-111"]);
        assert!(ids(&listed(sessions, "nothing like it")).is_empty());
    }

    #[test]
    fn an_empty_query_lists_all_in_order() {
        let sessions: Vec<SavedSessionSummary> = (0..MAX_LISTED + 5)
            .map(|n| summary(&format!("id-{n}"), &format!("Task {n}")))
            .collect();
        let picker = listed(sessions, "");
        let shown = ids(&picker);
        assert_eq!(shown.len(), MAX_LISTED);
        let expected: Vec<String> = (0..MAX_LISTED).map(|n| format!("id-{n}")).collect();
        assert_eq!(shown, expected);

        let key = project_key(r"C:\work\closta").expect("a key");
        assert!(ResumePicker::new(key, 1).filtered().is_empty(), "loading");
    }

    #[test]
    fn debug_shows_no_text_of_the_user() {
        let picker = listed(vec![summary("aaa-111", "Secret title")], "secret query");
        let shown = format!("{picker:?}");
        assert!(
            !shown.contains("Secret") && !shown.contains("secret"),
            "{shown}"
        );
        let row = ResumeRow {
            id: "aaa-111".to_owned(),
            title: "Secret title".to_owned(),
            updated_at_ms: 1,
            state: ResumeRowState::Closed,
        };
        let shown = format!("{row:?}");
        assert!(
            shown.contains("aaa-111") && !shown.contains("Secret"),
            "{shown}"
        );
    }
}
