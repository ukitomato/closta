//! A [`SavedSessions`] that gives what a test hands it instead of reading records, and keeps what
//! was asked. Mirrors the Kotlin test fixture `FakeSavedSessions.kt`.

use std::collections::BTreeMap;
use std::io::ErrorKind;
use std::sync::{Mutex, MutexGuard, PoisonError};

use closta_core::ports::{SavedSessions, SavedSessionsError};
use closta_model::{SavedSessionSummary, SavedTranscript};

#[derive(Default)]
struct Asked {
    list_failure: Option<SavedSessionsError>,
    read_failure: Option<SavedSessionsError>,
    held: bool,
    lists: usize,
    reads: Vec<String>,
    stopped_reads: usize,
}

/// The sessions it was given, by id. A session it does not hold reads as a record that is not there.
#[derive(Default)]
pub struct FakeSavedSessions {
    listed: Vec<SavedSessionSummary>,
    transcripts: BTreeMap<String, SavedTranscript>,
    asked: Mutex<Asked>,
}

impl FakeSavedSessions {
    pub fn with_listed(self, listed: Vec<SavedSessionSummary>) -> Self {
        Self { listed, ..self }
    }

    pub fn with_transcript(mut self, id: &str, transcript: SavedTranscript) -> Self {
        self.transcripts.insert(id.to_owned(), transcript);
        self
    }

    /// Every list from now on fails with `error`.
    pub fn fail_lists(&self, error: SavedSessionsError) {
        self.asked().list_failure = Some(error);
    }

    /// Every read from now on fails with `error`.
    pub fn fail_reads(&self, error: SavedSessionsError) {
        self.asked().read_failure = Some(error);
    }

    /// Every read from now on waits until its `stop` is true, and then ends as stopped.
    pub fn hold_reads(&self) {
        self.asked().held = true;
    }

    /// The ids `read` was called with, in order.
    pub fn reads(&self) -> Vec<String> {
        self.asked().reads.clone()
    }

    pub fn lists(&self) -> usize {
        self.asked().lists
    }

    /// How many held reads ended because their `stop` turned true.
    pub fn stopped_reads(&self) -> usize {
        self.asked().stopped_reads
    }

    fn asked(&self) -> MutexGuard<'_, Asked> {
        self.asked.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

const HELD_LOOK: std::time::Duration = std::time::Duration::from_millis(5);

impl SavedSessions for FakeSavedSessions {
    fn list(
        &self,
        _stop: &dyn Fn() -> bool,
    ) -> Result<Vec<SavedSessionSummary>, SavedSessionsError> {
        let mut asked = self.asked();
        asked.lists += 1;
        match asked.list_failure {
            Some(error) => Err(error),
            None => Ok(self.listed.clone()),
        }
    }

    fn read(
        &self,
        session_id: &str,
        stop: &dyn Fn() -> bool,
    ) -> Result<SavedTranscript, SavedSessionsError> {
        let held = {
            let mut asked = self.asked();
            asked.reads.push(session_id.to_owned());
            asked.held
        };
        if held {
            while !stop() {
                std::thread::sleep(HELD_LOOK);
            }
            self.asked().stopped_reads += 1;
            return Err(SavedSessionsError::Stopped);
        }
        if let Some(error) = self.asked().read_failure {
            return Err(error);
        }
        self.transcripts
            .get(session_id)
            .cloned()
            .ok_or(SavedSessionsError::Unreadable(ErrorKind::NotFound))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    fn never() -> bool {
        false
    }

    fn summary(id: &str) -> SavedSessionSummary {
        SavedSessionSummary {
            id: id.to_owned(),
            title: "a title".to_owned(),
            updated_at_ms: 1,
            bytes: 2,
        }
    }

    fn transcript(skipped: i32) -> SavedTranscript {
        SavedTranscript {
            events: vec![],
            skipped,
            dropped: 0,
        }
    }

    #[test]
    fn the_fake_gives_what_it_holds_and_counts_what_was_asked() {
        let fake = FakeSavedSessions::default()
            .with_listed(vec![summary("s1")])
            .with_transcript("s1", transcript(3));

        assert_eq!(fake.list(&never), Ok(vec![summary("s1")]));
        assert_eq!(fake.read("s1", &never), Ok(transcript(3)));
        assert_eq!(
            fake.read("unknown", &never),
            Err(SavedSessionsError::Unreadable(ErrorKind::NotFound))
        );
        fake.fail_lists(SavedSessionsError::NoPlace);
        fake.fail_reads(SavedSessionsError::Unreadable(ErrorKind::PermissionDenied));
        assert_eq!(fake.list(&never), Err(SavedSessionsError::NoPlace));
        assert_eq!(
            fake.read("s1", &never),
            Err(SavedSessionsError::Unreadable(ErrorKind::PermissionDenied))
        );

        assert_eq!(fake.lists(), 2);
        assert_eq!(fake.reads(), vec!["s1", "unknown", "s1"]);
        assert_eq!(fake.stopped_reads(), 0);
    }

    #[test]
    fn a_held_read_waits_for_stop() {
        let fake = Arc::new(FakeSavedSessions::default().with_transcript("s1", transcript(0)));
        fake.hold_reads();
        let stop = Arc::new(AtomicBool::new(false));
        let reading = {
            let (fake, stop) = (Arc::clone(&fake), Arc::clone(&stop));
            std::thread::spawn(move || fake.read("s1", &|| stop.load(Ordering::SeqCst)))
        };

        std::thread::sleep(Duration::from_millis(50));
        assert!(!reading.is_finished(), "the read waits");
        assert_eq!(fake.reads(), vec!["s1"]);
        stop.store(true, Ordering::SeqCst);

        assert_eq!(reading.join().unwrap(), Err(SavedSessionsError::Stopped));
        assert_eq!(fake.stopped_reads(), 1);
    }
}
