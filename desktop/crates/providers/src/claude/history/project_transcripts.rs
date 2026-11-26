//! The saved sessions of one project, read from the records the CLI writes:
//! `<config>/projects/<name>/<id>.jsonl`. It only reads, and only through [`RecordFs`].

use std::collections::VecDeque;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use closta_core::ports::{MAX_LISTED, SavedSessions, SavedSessionsError};
use closta_model::{SavedSessionSummary, SavedTranscript};

use super::bounded_lines::{BoundedLines, Line};
use super::record_files::{EntryKind, RecordFs, open_tail};
use super::record_lines::{Kept, MAX_LINE_BYTES, event_of, is_session_id};
use super::record_place::{RecordPlace, RecordPlaceUse};
use super::record_titles::title_of;
use super::text::kt_is_blank;

const SUFFIX: &str = ".jsonl";

/// The most bytes of a record that are read.
pub const MAX_RECORD_BYTES: u64 = 64 * 1024 * 1024;

/// What a list found: whether the project has a place at all, the sessions listed, and how many
/// records could not be read.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Survey {
    pub place_found: bool,
    pub sessions: Vec<SavedSessionSummary>,
    pub unreadable: usize,
}

pub struct ProjectTranscripts {
    fs: Arc<dyn RecordFs>,
    place: RecordPlace,
    max_record_bytes: u64,
    log: Arc<dyn Fn(&str) + Send + Sync>,
}

impl ProjectTranscripts {
    pub fn new(
        fs: Arc<dyn RecordFs>,
        config_dir: Arc<dyn Fn() -> Option<PathBuf> + Send + Sync>,
        working_directory: Option<String>,
        resolve_links: bool,
        log: Arc<dyn Fn(&str) + Send + Sync>,
    ) -> ProjectTranscripts {
        ProjectTranscripts {
            fs,
            place: RecordPlace::new(config_dir, working_directory, resolve_links),
            max_record_bytes: MAX_RECORD_BYTES,
            log,
        }
    }

    pub fn with_max_record_bytes(self, bytes: u64) -> Self {
        Self {
            max_record_bytes: bytes,
            ..self
        }
    }

    /// The newest-written records of the place, at most [`MAX_LISTED`], each titled as Claude Code
    /// titles it. A record with no user in its head is not listed; one that cannot be read is left
    /// out and counted; one gone since the place was looked at is left out and not counted.
    pub fn survey(&self, stop: &dyn Fn() -> bool) -> Result<Survey, SavedSessionsError> {
        let Some(place) =
            self.place
                .find(self.fs.as_ref(), RecordPlaceUse::List, self.log.as_ref())
        else {
            return Ok(Survey {
                place_found: false,
                sessions: vec![],
                unreadable: 0,
            });
        };
        let mut unreadable = 0;
        let mut records: Vec<Stamped> = Vec::new();
        for entry in self.fs.entries(&place).map_err(unreadable_as)? {
            let Some(id) = entry
                .name
                .strip_suffix(SUFFIX)
                .filter(|it| is_session_id(it))
            else {
                continue;
            };
            match entry.kind {
                EntryKind::File { modified_ms, bytes } => records.push(Stamped {
                    id: id.to_owned(),
                    // A time before 1970 is no time the view can show: the least it can say is 0.
                    modified_ms: modified_ms.max(0),
                    bytes: i64::try_from(bytes).unwrap_or(i64::MAX),
                }),
                EntryKind::Unreadable(ErrorKind::NotFound) | EntryKind::Other => {}
                EntryKind::Unreadable(_) => unreadable += 1,
            }
        }
        let found = records.len();
        records.sort_by(|a, b| {
            b.modified_ms
                .cmp(&a.modified_ms)
                .then_with(|| a.id.cmp(&b.id))
        });
        records.truncate(MAX_LISTED);
        let mut sessions = Vec::with_capacity(records.len());
        for record in records {
            if stop() {
                return Err(SavedSessionsError::Stopped);
            }
            match title_of(self.fs.as_ref(), &record_path(&place, &record.id)) {
                Ok(Some(title)) => sessions.push(SavedSessionSummary {
                    title: if title.is_empty() {
                        record.id.clone()
                    } else {
                        title
                    },
                    id: record.id,
                    updated_at_ms: record.modified_ms,
                    bytes: record.bytes,
                }),
                Ok(None) => {}
                Err(e) if e.kind() == ErrorKind::NotFound => {}
                Err(_) => unreadable += 1,
            }
        }
        // One record that cannot be read is left out, not a reason to list none: only the count is logged.
        (self.log)(&format!(
            "saved sessions: listed {} of {found} records, {unreadable} could not be read",
            sessions.len()
        ));
        Ok(Survey {
            place_found: true,
            sessions,
            unreadable,
        })
    }

    fn read_lines(
        &self,
        session_id: &str,
        stop: &dyn Fn() -> bool,
    ) -> Result<Reading, SavedSessionsError> {
        if !is_session_id(session_id) {
            return Err(SavedSessionsError::NotASessionId);
        }
        let place = self
            .place
            .find(self.fs.as_ref(), RecordPlaceUse::Read, self.log.as_ref())
            .ok_or(SavedSessionsError::NoPlace)?;
        let opened = open_tail(
            self.fs.as_ref(),
            &record_path(&place, session_id),
            self.max_record_bytes,
        )
        .map_err(unreadable_as)?;
        let mut reading = Reading::default();
        if opened.oldest_unread {
            // The lines before were never read, so they cannot be counted: at least one was dropped, for
            // the view to say that older ones were left out.
            reading.dropped += 1;
            reading.oldest_unread = true;
        }
        let mut lines = BoundedLines::new(opened.reader, MAX_LINE_BYTES);
        loop {
            // Looked at once a line: a read of a big record does not outlive the one that asked for it.
            if stop() {
                return Err(SavedSessionsError::Stopped);
            }
            match lines.next_line().map_err(unreadable_as)? {
                None => break,
                Some(Line::TooLong) => {
                    reading.skipped += 1;
                    reading.too_long += 1;
                }
                Some(Line::Text(text)) if kt_is_blank(&text) => {}
                Some(Line::Text(text)) => match event_of(&text) {
                    Some(kept) => reading.kept.push_back(kept),
                    None => reading.skipped += 1,
                },
            }
        }
        // A cut can leave, first, the answer to a call that was cut away: with nothing to belong to, it is
        // left out too.
        while reading.dropped > 0 && reading.kept.front().is_some_and(|it| it.only_results) {
            reading.kept.pop_front();
            reading.dropped += 1;
        }
        Ok(reading)
    }
}

struct Stamped {
    id: String,
    modified_ms: i64,
    bytes: i64,
}

#[derive(Default)]
struct Reading {
    kept: VecDeque<Kept>,
    skipped: usize,
    too_long: usize,
    dropped: usize,
    oldest_unread: bool,
}

fn record_path(place: &Path, id: &str) -> PathBuf {
    place.join(format!("{id}{SUFFIX}"))
}

fn unreadable_as(e: io::Error) -> SavedSessionsError {
    SavedSessionsError::Unreadable(e.kind())
}

fn count(n: usize) -> i32 {
    i32::try_from(n).unwrap_or(i32::MAX)
}

impl SavedSessions for ProjectTranscripts {
    fn list(
        &self,
        stop: &dyn Fn() -> bool,
    ) -> Result<Vec<SavedSessionSummary>, SavedSessionsError> {
        self.survey(stop).map(|survey| survey.sessions)
    }

    fn read(
        &self,
        session_id: &str,
        stop: &dyn Fn() -> bool,
    ) -> Result<SavedTranscript, SavedSessionsError> {
        let reading = self.read_lines(session_id, stop)?;
        (self.log)(&format!(
            "saved sessions: read {} lines, {} skipped ({} over the line limit), {} dropped{}",
            reading.kept.len(),
            reading.skipped,
            reading.too_long,
            reading.dropped,
            if reading.oldest_unread {
                ", the oldest part of the record was not read"
            } else {
                ""
            },
        ));
        Ok(SavedTranscript {
            events: reading.kept.into_iter().map(|it| it.event).collect(),
            skipped: count(reading.skipped),
            dropped: count(reading.dropped),
        })
    }
}

impl std::fmt::Debug for ProjectTranscripts {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ProjectTranscripts")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::fake::record_fs::MemoryRecordFs;
    use crate::claude::history::record_place::name_of;
    use closta_model::AgentEvent;
    use serde_json::{Value, json};
    use std::cell::Cell;
    use std::io::ErrorKind;
    use std::sync::Mutex;

    const CWD: &str = "/work/the project";
    const SESSION: &str = "336ed47b-2675-4317-b3f5-a3b48abb03a2";
    const PART_OF_A_LINE: u64 = 5;

    fn never() -> bool {
        false
    }

    #[derive(Default)]
    struct Fixture {
        fs: Arc<MemoryRecordFs>,
        logged: Arc<Mutex<Vec<String>>>,
        counter: Cell<usize>,
    }

    impl Fixture {
        fn next(&self) -> usize {
            self.counter.set(self.counter.get() + 1);
            self.counter.get()
        }

        fn place(&self) -> String {
            let place = format!("/config/projects/{}", name_of(CWD));
            self.fs.dir(&place);
            place
        }

        fn path_of(&self, id: &str) -> String {
            format!("{}/{id}.jsonl", self.place())
        }

        fn sessions(&self) -> ProjectTranscripts {
            self.sessions_in(Some(CWD))
        }

        fn sessions_in(&self, directory: Option<&str>) -> ProjectTranscripts {
            let logged = Arc::clone(&self.logged);
            ProjectTranscripts::new(
                Arc::clone(&self.fs) as Arc<dyn RecordFs>,
                Arc::new(|| Some(PathBuf::from("/config"))),
                directory.map(str::to_owned),
                false,
                Arc::new(move |line: &str| logged.lock().unwrap().push(line.to_owned())),
            )
        }

        fn logged(&self) -> Vec<String> {
            self.logged.lock().unwrap().clone()
        }

        fn id(&self) -> String {
            format!("00000000-0000-4000-8000-{:012}", self.next())
        }

        fn record(&self, lines: &[String]) -> String {
            let id = self.id();
            let modified = (1_000_000 + self.counter.get() as i64) * 1000;
            self.record_at(lines, &id, modified);
            id
        }

        fn record_at(&self, lines: &[String], id: &str, modified_ms: i64) {
            let mut text = lines.join("\n");
            text.push('\n');
            self.fs
                .put(&self.path_of(id), text.into_bytes(), modified_ms);
        }

        fn line(&self, base: Value, more: &[(&str, Value)]) -> String {
            let mut row = base;
            for (key, value) in more {
                row[*key] = value.clone();
            }
            row.to_string()
        }

        fn user_line(&self, content: Value, more: &[(&str, Value)]) -> String {
            let base = json!({
                "type": "user",
                "uuid": format!("u-{}", self.next()),
                "sessionId": SESSION,
                "timestamp": "2026-10-17T05:40:20.077Z",
                "isSidechain": false,
                "message": {"role": "user", "content": content},
            });
            self.line(base, more)
        }

        fn user_says(&self, sentence: &str, more: &[(&str, Value)]) -> String {
            self.user_line(json!(sentence), more)
        }

        fn assistant_line(
            &self,
            blocks: Value,
            message_id: &str,
            more: &[(&str, Value)],
        ) -> String {
            let n = self.next();
            let base = json!({
                "type": "assistant",
                "uuid": format!("a-{n}"),
                "sessionId": SESSION,
                "timestamp": "2026-10-17T05:40:21.000Z",
                "requestId": format!("req_{n}"),
                "isSidechain": false,
                "message": {"id": message_id, "role": "assistant", "content": blocks},
            });
            self.line(base, more)
        }

        fn says(&self, sentence: &str) -> String {
            let id = format!("msg_{}", self.counter.get());
            self.assistant_line(text(&[sentence]), &id, &[])
        }
    }

    fn text(blocks: &[&str]) -> Value {
        Value::Array(
            blocks
                .iter()
                .map(|it| json!({"type": "text", "text": it}))
                .collect(),
        )
    }

    fn tool_result() -> Value {
        json!([{"type": "tool_result", "tool_use_id": "toolu_1", "content": "ok", "is_error": false}])
    }

    fn meta(kind: &str) -> String {
        json!({"type": kind, "sessionId": SESSION}).to_string()
    }

    fn kinds(read: &SavedTranscript) -> Vec<&'static str> {
        read.events
            .iter()
            .map(|event| match event {
                AgentEvent::User { .. } => "User",
                AgentEvent::Assistant { .. } => "Assistant",
                _ => "Other",
            })
            .collect()
    }

    // ---- the list ----

    #[test]
    fn the_list_is_the_projects_records_the_most_recently_written_first_50_at_most() {
        let f = Fixture::default();
        let ids: Vec<String> = (1..=55)
            .map(|n| {
                let line = f.user_says(&format!("question {n}"), &[]);
                let id = f.id();
                f.record_at(&[line], &id, (1_000 + n) * 1000);
                id
            })
            .collect();

        let listed = f.sessions().list(&never).unwrap();

        assert_eq!(listed.len(), MAX_LISTED);
        let newest: Vec<String> = ids.iter().rev().take(MAX_LISTED).cloned().collect();
        assert_eq!(
            listed.iter().map(|it| it.id.clone()).collect::<Vec<_>>(),
            newest,
            "the newest 50, newest first"
        );
        assert_eq!(listed[0].title, "question 55");
        assert_eq!(listed[0].updated_at_ms, (1_000 + 55) * 1000);
        assert!(listed[0].bytes > 0);
    }

    #[test]
    fn only_a_record_named_by_a_session_id_is_one_and_none_is_listed_for_a_place_that_is_not_there()
    {
        let f = Fixture::default();
        let kept = f.user_says("kept", &[]);
        f.record_at(&[kept], "11111111-2222-4333-8444-555555555555", 1_000);
        let place = f.place();
        let other = f.user_says("not a session id", &[]);
        f.fs.put(
            &format!("{place}/notes.jsonl"),
            format!("{other}\n").into_bytes(),
            2_000,
        );
        let other = f.user_says("not a record", &[]);
        f.fs.put(
            &format!("{place}/22222222-2222-4333-8444-555555555555.txt"),
            format!("{other}\n").into_bytes(),
            3_000,
        );
        f.fs.dir(&format!(
            "{place}/33333333-2222-4333-8444-555555555555.jsonl"
        ));

        let titles: Vec<String> = f
            .sessions()
            .list(&never)
            .unwrap()
            .into_iter()
            .map(|it| it.title)
            .collect();

        assert_eq!(titles, vec!["kept".to_owned()]);
        assert_eq!(
            f.sessions_in(Some("/another/place")).list(&never),
            Ok(vec![]),
            "no place, no sessions"
        );
    }

    #[test]
    fn a_place_that_cannot_be_read_makes_the_list_fail() {
        let f = Fixture::default();
        let line = f.user_says("x", &[]);
        f.record(&[line]);
        f.fs.unreadable_dir(&f.place(), ErrorKind::PermissionDenied);

        assert_eq!(
            f.sessions().list(&never),
            Err(SavedSessionsError::Unreadable(ErrorKind::PermissionDenied))
        );
    }

    // ---- the read ----

    #[test]
    fn a_read_gives_the_user_and_assistant_lines_as_the_events_stdout_gives_and_counts_the_rest() {
        let f = Fixture::default();
        let lines = vec![
            meta("queue-operation"),
            f.user_says("hello", &[]),
            meta("attachment"),
            "{not json".to_owned(),
            f.assistant_line(text(&["hi"]), "msg_1", &[]),
            f.assistant_line(text(&["deep"]), "msg_2", &[("isSidechain", json!(true))]),
            f.user_says("a note", &[("isMeta", json!(true))]),
            f.user_says("a summary", &[("isCompactSummary", json!(true))]),
            f.user_line(tool_result(), &[("toolUseResult", json!({"stdout": "ok"}))]),
            meta("last-prompt"),
        ];
        let sid = f.record(&lines);

        let read = f.sessions().read(&sid, &never).unwrap();

        assert_eq!(kinds(&read), vec!["User", "Assistant", "User"]);
        assert_eq!(
            read.skipped, 7,
            "other kinds, a damaged line, a sub-agent's, a note, a summary"
        );
        assert_eq!(read.dropped, 0);
        let AgentEvent::User {
            tool_use_result, ..
        } = &read.events[2]
        else {
            panic!("a user event");
        };
        let result: Value = serde_json::from_str(&tool_use_result.as_ref().unwrap().0).unwrap();
        assert_eq!(result, json!({"stdout": "ok"}));
        let AgentEvent::Assistant {
            session_id,
            request_id,
            message,
            ..
        } = &read.events[1]
        else {
            panic!("an assistant event");
        };
        assert_eq!(session_id, SESSION);
        assert!(
            request_id
                .as_deref()
                .unwrap_or_default()
                .starts_with("req_")
        );
        assert!(message.0.contains("msg_1"));
    }

    #[test]
    fn a_line_without_the_fields_an_event_needs_is_skipped_not_half_made() {
        let f = Fixture::default();
        let lines = vec![
            json!({"type": "user", "message": {"role": "user", "content": "no uuid"}}).to_string(),
            json!({"type": "assistant", "uuid": "a1", "sessionId": SESSION, "timestamp": "t"})
                .to_string(),
            f.user_says("fine", &[]),
        ];
        let sid = f.record(&lines);

        let read = f.sessions().read(&sid, &never).unwrap();

        assert_eq!(read.events.len(), 1);
        assert_eq!(read.skipped, 2);
    }

    #[test]
    fn a_record_cut_by_its_size_drops_first_a_result_that_lost_its_call() {
        let f = Fixture::default();
        let mut lines: Vec<String> = (0..10).map(|n| f.says(&format!("older {n}"))).collect();
        let newer = vec![
            f.user_line(tool_result(), &[]),
            f.says("after the result"),
            f.user_says("and then", &[]),
        ];
        let tail = (newer.join("\n").len() + 1) as u64;
        lines.extend(newer);
        let sid = f.record(&lines);

        let read = f
            .sessions()
            .with_max_record_bytes(tail + PART_OF_A_LINE)
            .read(&sid, &never)
            .unwrap();

        assert_eq!(
            read.events.len(),
            2,
            "the result that heads the rest belongs to a call that was cut away"
        );
        assert!(matches!(read.events[0], AgentEvent::Assistant { .. }));
        assert!(
            read.dropped >= 2,
            "the cut line, and the result that lost its call"
        );
        assert!(
            f.logged()
                .last()
                .unwrap()
                .ends_with(", the oldest part of the record was not read")
        );
    }

    #[test]
    fn a_read_of_a_record_that_is_not_there_fails() {
        let f = Fixture::default();
        let lines: Vec<String> = (0..3).map(|n| f.says(&format!("line {n}"))).collect();
        let sid = f.record(&lines);

        assert_eq!(
            f.sessions()
                .read("99999999-2222-4333-8444-555555555555", &never),
            Err(SavedSessionsError::Unreadable(ErrorKind::NotFound))
        );
        assert_eq!(
            f.sessions().read("../escape", &never),
            Err(SavedSessionsError::NotASessionId)
        );
        assert_eq!(
            f.sessions_in(None).read(&sid, &never),
            Err(SavedSessionsError::NoPlace)
        );
    }

    #[test]
    fn the_log_says_counts_and_reasons_and_never_what_a_line_said() {
        let f = Fixture::default();
        let lines = vec![
            f.user_says("the user's own words 4711", &[]),
            f.says("and the answer 4712"),
            "{not json".to_owned(),
        ];
        let sid = f.record(&lines);

        f.sessions().list(&never).unwrap();
        f.sessions().read(&sid, &never).unwrap();

        let logged = f.logged();
        assert!(!logged.is_empty());
        assert!(
            logged
                .iter()
                .all(|it| !it.contains("4711") && !it.contains("4712")),
            "{logged:?}"
        );
        assert!(
            logged
                .contains(&"saved sessions: listed 1 of 1 records, 0 could not be read".to_owned()),
            "{logged:?}"
        );
        assert!(
            logged.contains(
                &"saved sessions: read 2 lines, 1 skipped (0 over the line limit), 0 dropped"
                    .to_owned()
            ),
            "{logged:?}"
        );
    }

    // ---- the limits ----

    #[test]
    fn a_read_of_a_big_record_stops_when_it_is_cancelled_and_does_not_outlive_the_one_that_asked() {
        let f = Fixture::default();
        let lines = vec![r#"{"type":"attachment"}"#.to_owned(); 1_000];
        let sid = f.record(&lines);
        let asked = Cell::new(0);
        let stop = || {
            asked.set(asked.get() + 1);
            asked.get() >= 100
        };

        assert_eq!(
            f.sessions().read(&sid, &stop),
            Err(SavedSessionsError::Stopped)
        );
        assert_eq!(asked.get(), 100, "once a line");
        assert!(
            f.logged()
                .iter()
                .all(|it| !it.starts_with("saved sessions: read ")),
            "{:?}",
            f.logged()
        );
    }

    #[test]
    fn a_record_that_is_a_link_is_not_listed_and_not_read_wherever_it_points() {
        let f = Fixture::default();
        let outside = f.user_says("outside the place", &[]);
        f.fs.put(
            "/config/elsewhere/a.jsonl",
            format!("{outside}\n").into_bytes(),
            1_000,
        );
        let link_id = f.id();
        f.fs.link(&f.path_of(&link_id), "/config/elsewhere/a.jsonl");
        let inside = f.user_says("inside the place", &[]);
        let real = f.record(&[inside]);

        let listed: Vec<String> = f
            .sessions()
            .list(&never)
            .unwrap()
            .into_iter()
            .map(|it| it.id)
            .collect();

        assert_eq!(listed, vec![real], "the link is not a record of the place");
        assert!(matches!(
            f.sessions().read(&link_id, &never),
            Err(SavedSessionsError::Unreadable(_))
        ));
        assert!(
            f.logged()
                .iter()
                .all(|it| !it.contains("outside the place"))
        );
    }

    #[test]
    fn a_record_that_cannot_be_read_is_left_out_of_the_list_and_the_others_are_listed_with_the_count_logged()
     {
        for at_open in [false, true] {
            let f = Fixture::default();
            let line = f.user_says("kept one", &[]);
            let kept = f.record(&[line]);
            let line = f.user_says("blocked", &[]);
            let blocked = f.record(&[line]);
            let line = f.user_says("kept two", &[]);
            let also = f.record(&[line]);
            if at_open {
                f.fs.fail_open(&f.path_of(&blocked), ErrorKind::PermissionDenied);
            } else {
                f.fs.unreadable_entry(&f.path_of(&blocked), ErrorKind::PermissionDenied);
            }

            let mut listed: Vec<String> = f
                .sessions()
                .list(&never)
                .unwrap()
                .into_iter()
                .map(|it| it.id)
                .collect();
            listed.sort();

            assert_eq!(listed, vec![kept, also], "at open: {at_open}");
            let logged = f.logged();
            assert!(
                logged.iter().any(|it| it.contains("1 could not be read")),
                "{logged:?}"
            );
            assert!(logged.iter().all(|it| !it.contains("blocked")));
        }
    }

    #[test]
    fn a_record_written_before_1970_is_listed_at_time_0_never_a_negative_one() {
        let f = Fixture::default();
        let line = f.user_says("old", &[]);
        let sid = f.id();
        f.record_at(&[line], &sid, -5_000);

        let listed = f.sessions().list(&never).unwrap();

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, sid);
        assert_eq!(listed[0].updated_at_ms, 0);
    }

    // ---- added ----

    #[test]
    fn a_record_gone_after_the_listing_is_left_out_without_being_counted() {
        for at_open in [false, true] {
            let f = Fixture::default();
            let line = f.user_says("kept", &[]);
            let kept = f.record(&[line]);
            let line = f.user_says("gone", &[]);
            let gone = f.record(&[line]);
            if at_open {
                f.fs.fail_open(&f.path_of(&gone), ErrorKind::NotFound);
            } else {
                f.fs.unreadable_entry(&f.path_of(&gone), ErrorKind::NotFound);
            }

            let listed: Vec<String> = f
                .sessions()
                .list(&never)
                .unwrap()
                .into_iter()
                .map(|it| it.id)
                .collect();

            assert_eq!(listed, vec![kept], "at open: {at_open}");
            let logged = f.logged();
            assert!(
                logged.iter().any(|it| it.contains("0 could not be read")),
                "{logged:?}"
            );
        }
    }

    #[test]
    fn a_record_whose_last_line_is_half_written_reads_the_rest() {
        let f = Fixture::default();
        let whole = [f.user_says("hello", &[]), f.says("hi")];
        let half = f.says("being written");
        let mut bytes = format!("{}\n{}\n", whole[0], whole[1]).into_bytes();
        bytes.extend_from_slice(&half.as_bytes()[..half.len() / 2]);
        let sid = f.id();
        f.fs.put(&f.path_of(&sid), bytes, 1_000);

        let read = f.sessions().read(&sid, &never).unwrap();

        assert_eq!(kinds(&read), vec!["User", "Assistant"]);
        assert_eq!(read.skipped, 1, "the half-written line is a damaged one");
        assert_eq!(read.dropped, 0);
    }

    #[test]
    fn a_record_that_is_gone_reads_as_not_found() {
        let f = Fixture::default();
        let line = f.user_says("listed, then removed", &[]);
        let sid = f.record(&[line]);
        assert_eq!(f.sessions().list(&never).unwrap().len(), 1);
        f.fs.fail_open(&f.path_of(&sid), ErrorKind::NotFound);

        assert_eq!(
            f.sessions().read(&sid, &never),
            Err(SavedSessionsError::Unreadable(ErrorKind::NotFound))
        );
    }

    #[test]
    fn an_empty_record_reads_as_nothing_and_is_not_listed() {
        let f = Fixture::default();
        let sid = f.id();
        f.fs.put(&f.path_of(&sid), Vec::new(), 1_000);

        assert_eq!(f.sessions().list(&never), Ok(vec![]));
        let read = f.sessions().read(&sid, &never).unwrap();
        assert!(read.events.is_empty());
        assert_eq!((read.skipped, read.dropped), (0, 0));
    }

    #[test]
    fn a_list_stops_when_asked() {
        let f = Fixture::default();
        let line = f.user_says("one", &[]);
        f.record(&[line]);

        assert_eq!(
            f.sessions().list(&|| true),
            Err(SavedSessionsError::Stopped)
        );
    }

    #[test]
    fn the_survey_tells_a_missing_place_from_an_empty_one() {
        let f = Fixture::default();
        assert_eq!(
            f.sessions().survey(&never),
            Ok(Survey {
                place_found: false,
                sessions: vec![],
                unreadable: 0
            })
        );
        f.place();
        assert_eq!(
            f.sessions().survey(&never),
            Ok(Survey {
                place_found: true,
                sessions: vec![],
                unreadable: 0
            })
        );
    }

    #[test]
    fn a_lone_surrogate_and_a_deep_line_are_skipped() {
        let f = Fixture::default();
        let lone = format!(
            r#"{{"type":"user","uuid":"\ud800","sessionId":"{SESSION}","timestamp":"t","message":{{"role":"user","content":"x"}}}}"#
        );
        let deep = format!(
            r#"{{"type":"user","deep":{}{},"uuid":"u","sessionId":"{SESSION}","timestamp":"t","message":{{"role":"user","content":"x"}}}}"#,
            "[".repeat(200),
            "]".repeat(200)
        );
        let lines = vec![lone, deep, f.user_says("fine", &[])];
        let sid = f.record(&lines);

        let read = f.sessions().read(&sid, &never).unwrap();

        assert_eq!(read.events.len(), 1);
        assert_eq!(read.skipped, 2);
    }

    #[test]
    fn a_blank_line_of_full_width_spaces_is_not_counted() {
        let f = Fixture::default();
        let lines = vec![
            f.user_says("hello", &[]),
            "\u{3000}".to_owned(),
            String::new(),
            f.says("hi"),
        ];
        let sid = f.record(&lines);

        let read = f.sessions().read(&sid, &never).unwrap();

        assert_eq!(read.events.len(), 2);
        assert_eq!(read.skipped, 0);
    }

    #[test]
    fn debug_shows_nothing_of_the_place() {
        let f = Fixture::default();
        assert_eq!(format!("{:?}", f.sessions()), "ProjectTranscripts");
    }
}
