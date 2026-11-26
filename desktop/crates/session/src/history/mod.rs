//! The history of a project's sessions: where the CLI keeps their records, the list of them, and
//! how a resumed session puts its record back. SessionOpening.kt, SessionListing.kt,
//! RestoreSteps.kt, SessionViewHistory.kt and the record source of WslLaunching.kt.

pub mod place;
pub mod restore;

use closta_core::ports::SavedSessions;
use closta_model::SavedSessionSummary;

use crate::log::SessionLog;

/// How a session is opened: a new conversation, or the saved session of the session's own id put
/// back. A resume holds no id of its own, so it cannot name another session than the one it opens.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum SessionOpening {
    #[default]
    New,
    Resume,
}

/// A project's saved sessions as the list shows them. With `unreadable` the list could not be read
/// and `sessions` is empty.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct SavedListing {
    pub sessions: Vec<SavedSessionSummary>,
    pub unreadable: bool,
}

/// The saved sessions `saved` lists. A list that fails, or no `saved` to list from, is a listing
/// that could not be read, and only the kind of the failure is logged.
pub fn listing(
    saved: Option<&dyn SavedSessions>,
    stop: &dyn Fn() -> bool,
    log: &dyn SessionLog,
) -> SavedListing {
    let listed = match saved {
        None => Err("no saved sessions".to_owned()),
        Some(saved) => saved.list(stop).map_err(|error| format!("{error:?}")),
    };
    match listed {
        Ok(sessions) => SavedListing {
            sessions,
            unreadable: false,
        },
        Err(kind) => {
            log.warn(&format!("the saved sessions could not be listed ({kind})"));
            SavedListing {
                sessions: Vec::new(),
                unreadable: true,
            }
        }
    }
}

#[cfg(test)]
pub(crate) mod test_log {
    use std::sync::{Mutex, PoisonError};

    use crate::log::SessionLog;

    /// Every line logged, each after its level.
    #[derive(Default)]
    pub(crate) struct Logged(Mutex<Vec<String>>);

    impl Logged {
        pub(crate) fn lines(&self) -> Vec<String> {
            self.0
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .clone()
        }

        fn push(&self, level: &str, line: &str) {
            self.0
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(format!("{level} {line}"));
        }
    }

    impl SessionLog for Logged {
        fn info(&self, line: &str) {
            self.push("INFO", line);
        }

        fn warn(&self, line: &str) {
            self.push("WARN", line);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::ErrorKind;

    use closta_core::ports::SavedSessionsError;
    use closta_providers::claude::fake::saved::FakeSavedSessions;

    use super::test_log::Logged;
    use super::*;

    fn summary(id: &str) -> SavedSessionSummary {
        SavedSessionSummary {
            id: id.to_owned(),
            title: "a title".to_owned(),
            updated_at_ms: 1_000,
            bytes: 10,
        }
    }

    #[test]
    fn a_listing_that_fails_is_unreadable_and_logs_the_kind() {
        let saved = FakeSavedSessions::default().with_listed(vec![summary("s1")]);
        saved.fail_lists(SavedSessionsError::Unreadable(ErrorKind::Unsupported));
        let log = Logged::default();

        let listed = listing(Some(&saved), &|| false, &log);

        assert_eq!(
            listed,
            SavedListing {
                sessions: Vec::new(),
                unreadable: true
            }
        );
        assert_eq!(
            log.lines(),
            ["WARN the saved sessions could not be listed (Unreadable(Unsupported))"]
        );
    }

    #[test]
    fn no_saved_sessions_is_an_unreadable_listing() {
        let log = Logged::default();

        let listed = listing(None, &|| false, &log);

        assert!(listed.unreadable);
        assert!(listed.sessions.is_empty());
        assert_eq!(
            log.lines(),
            ["WARN the saved sessions could not be listed (no saved sessions)"]
        );
    }

    #[test]
    fn a_listing_gives_what_was_listed() {
        let saved = FakeSavedSessions::default().with_listed(vec![summary("s1"), summary("s2")]);
        let log = Logged::default();

        let listed = listing(Some(&saved), &|| false, &log);

        assert_eq!(
            listed,
            SavedListing {
                sessions: vec![summary("s1"), summary("s2")],
                unreadable: false
            }
        );
        assert_eq!(saved.lists(), 1);
        assert!(log.lines().is_empty());
    }
}
