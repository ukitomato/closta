//! The saved sessions of a project: where the CLI keeps its records, the reader of one project's
//! records, and the port the shell lists and opens them through.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use closta_core::ports::SavedSessions;
use closta_providers::claude::history::{ProjectTranscripts, StdRecordFs};
use closta_providers::claude::launch::wsl::WslLocation;
use closta_session::history::place::{
    ProbeSpawnerFor, RecordHomes, WslHome, native_config_dir, record_source, wsl_record_home,
};
use closta_session::history::{SavedListing, listing};
use closta_session::log::{SessionLog, TracingLog};
use closta_shell::new_session::SavedFor;
use closta_shell::projects::{ProjectKey, project_key};
use futures_lite::future;

use crate::ports::wsl_spawner;

/// Where the CLI keeps its records in each WSL distribution, asked of the distribution's `sh`.
pub fn record_homes() -> Arc<RecordHomes> {
    let spawner_for: ProbeSpawnerFor = Arc::new(wsl_spawner);
    Arc::new(RecordHomes::new(Arc::new(move |location: &WslLocation| {
        wsl_record_home(location, &spawner_for, &TracingLog)
    })))
}

/// The saved sessions of the project in `folder`, read from this machine's config directory or,
/// for a folder in a WSL distribution, from the place `homes` finds there.
pub fn saved_sessions_for(folder: &str, homes: &Arc<RecordHomes>) -> ProjectTranscripts {
    let homes = Arc::clone(homes);
    saved_sessions_in(
        folder,
        native_config_dir(&|name| std::env::var(name).ok()),
        Arc::new(move |location: &WslLocation| homes.home(location)),
    )
}

/// The saved sessions of the project in `folder`, read from `native_config` or, for a folder in a
/// WSL distribution, from the place `wsl_home` gives.
pub fn saved_sessions_in(
    folder: &str,
    native_config: Option<PathBuf>,
    wsl_home: Arc<WslHome>,
) -> ProjectTranscripts {
    let source = record_source(Some(folder), cfg!(windows), native_config, wsl_home);
    ProjectTranscripts::new(
        Arc::new(StdRecordFs),
        source.config_dir,
        source.working_directory,
        source.resolve_links,
        Arc::new(|line: &str| TracingLog.info(line)),
    )
}

/// The saved sessions of each project, made once per project and kept: a project's reader
/// remembers where its records are.
pub struct RealSavedFor {
    homes: Arc<RecordHomes>,
    kept: Mutex<HashMap<ProjectKey, Arc<ProjectTranscripts>>>,
}

impl RealSavedFor {
    pub fn new(homes: Arc<RecordHomes>) -> RealSavedFor {
        RealSavedFor {
            homes,
            kept: Mutex::new(HashMap::new()),
        }
    }

    fn transcripts(&self, folder: &str) -> Arc<ProjectTranscripts> {
        // A blank folder names no project: its reader is made each time and not kept.
        let Some(key) = project_key(folder) else {
            return Arc::new(saved_sessions_for(folder, &self.homes));
        };
        let mut kept = self.kept.lock().unwrap_or_else(PoisonError::into_inner);
        Arc::clone(
            kept.entry(key)
                .or_insert_with(|| Arc::new(saved_sessions_for(folder, &self.homes))),
        )
    }
}

impl SavedFor for RealSavedFor {
    fn saved(&self, folder: &str) -> Arc<dyn SavedSessions> {
        self.transcripts(folder)
    }

    fn list(&self, folder: &str, stop: Arc<AtomicBool>) -> future::Boxed<Option<SavedListing>> {
        let saved = self.transcripts(folder);
        Box::pin(blocking::unblock(move || {
            // Stopped before the read began: a place that is not found is never asked about.
            if stop.load(Ordering::SeqCst) {
                return None;
            }
            listing(Some(&*saved), &|| stop.load(Ordering::SeqCst), &TracingLog)
        }))
    }
}

#[cfg(test)]
mod tests {
    use std::thread::{self, ThreadId};

    use super::*;

    #[test]
    fn the_same_project_gets_the_same_saved_sessions() {
        let saved_for = RealSavedFor::new(Arc::new(RecordHomes::new(Arc::new(|_| None))));

        let first = saved_for.saved(r"C:\Work");
        let again = saved_for.saved("c:/work/");
        let other = saved_for.saved(r"C:\Other");

        assert!(Arc::ptr_eq(&first, &again));
        assert!(!Arc::ptr_eq(&first, &other));
    }

    #[test]
    fn a_listing_runs_off_the_calling_thread() {
        let asked_on: Arc<Mutex<Vec<ThreadId>>> = Arc::default();
        let homes = {
            let asked_on = Arc::clone(&asked_on);
            Arc::new(RecordHomes::new(Arc::new(move |_: &WslLocation| {
                asked_on
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .push(thread::current().id());
                None
            })))
        };
        let saved_for = RealSavedFor::new(homes);
        let folder = r"\\wsl.localhost\Ubuntu\home\me\p";

        let listed = smol::block_on(saved_for.list(folder, Arc::new(AtomicBool::new(false))));

        assert!(listed.is_some());
        let asked_on = asked_on
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone();
        assert_eq!(asked_on.len(), 1);
        assert_ne!(asked_on[0], thread::current().id());

        let stopped = smol::block_on(saved_for.list(folder, Arc::new(AtomicBool::new(true))));

        assert_eq!(stopped, None);
    }

    #[test]
    fn saved_sessions_for_shows_nothing_of_the_folder() {
        let homes = Arc::new(RecordHomes::new(Arc::new(|_| None)));

        let sessions = saved_sessions_for(r"\\wsl.localhost\Ubuntu\home\me\p", &homes);

        assert_eq!(format!("{sessions:?}"), "ProjectTranscripts");
    }
}
